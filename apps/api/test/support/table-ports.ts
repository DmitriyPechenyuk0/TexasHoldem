import { bytesToHex, commitServerSeed, fullDeck } from "@holdem/engine";
import {
	type DealtDeck,
	DeckProvider,
} from "@/modules/table/application/deck-provider.js";
import { TableUnavailableError } from "@/modules/table/application/runtime/table-routing-errors.js";
import {
	type TableLease,
	TableLeases,
} from "@/modules/table/application/table-leases.js";
import {
	type TableReplies,
	type TableRequest,
	TableRequests,
} from "@/modules/table/application/table-requests.js";
import { UnfinishedTables } from "@/modules/table/application/unfinished-tables.js";

/** The server seed of every fixed deal. */
export const FIXED_SEED = new Uint8Array(32).fill(7);

/**
 * The deck in canonical order for every hand, the button on the first player, and a commitment
 * to `FIXED_SEED`, which `reveal` gives back. The deck does not come from the seed: tables check
 * the seed against the commitment only.
 */
export class FixedDeckProvider extends DeckProvider {
	readonly dealt: string[] = [];
	readonly revealed: string[] = [];

	async deal(_tableId: string, handId: string): Promise<DealtDeck> {
		this.dealt.push(handId);
		return {
			deck: fullDeck(),
			buttonDraw: 0,
			commitment: commitServerSeed(FIXED_SEED),
		};
	}

	async reveal(handId: string): Promise<string | null> {
		if (!this.dealt.includes(handId)) return null;
		this.revealed.push(handId);
		return bytesToHex(FIXED_SEED);
	}
}

interface HeldLease {
	readonly instanceId: string;
	readonly epoch: number;
	expiresAt: number;
}

/**
 * Leases of every instance of a test cluster, kept in memory with the Redis leases' rules; each
 * instance gets its view with `forInstance`. `now` is the cluster's clock.
 */
export class InMemoryLeaseStore {
	readonly held = new Map<string, HeldLease>();
	readonly epochs = new Map<string, number>();
	readonly leased = new Set<string>();

	constructor(
		readonly ttlMs: number,
		readonly now: () => number,
	) {}

	forInstance(instanceId: string): InMemoryTableLeases {
		return new InMemoryTableLeases(this, instanceId);
	}

	/** Lets the table's lease run out at once, as if its holder had stopped renewing it. */
	expire(tableId: string): void {
		this.held.delete(tableId);
	}

	current(tableId: string): HeldLease | undefined {
		const lease = this.held.get(tableId);
		if (lease && lease.expiresAt <= this.now()) {
			this.held.delete(tableId);
			return undefined;
		}
		return lease;
	}
}

export class InMemoryTableLeases extends TableLeases {
	constructor(
		private readonly leases: InMemoryLeaseStore,
		readonly instanceId: string,
	) {
		super();
	}

	async acquire(tableId: string, atLeast: number): Promise<TableLease | null> {
		const current = this.leases.current(tableId);
		if (current && current.instanceId !== this.instanceId) return null;
		const epoch = Math.max(
			(this.leases.epochs.get(tableId) ?? 0) + 1,
			atLeast + 1,
		);
		this.leases.epochs.set(tableId, epoch);
		this.leases.held.set(tableId, {
			instanceId: this.instanceId,
			epoch,
			expiresAt: this.leases.now() + this.leases.ttlMs,
		});
		this.leases.leased.add(tableId);
		return { tableId, epoch };
	}

	async ownerOf(tableId: string): Promise<string | null> {
		return this.leases.current(tableId)?.instanceId ?? null;
	}

	async renew({ tableId, epoch }: TableLease): Promise<boolean> {
		const current = this.leases.current(tableId);
		if (current?.instanceId !== this.instanceId || current.epoch !== epoch) {
			return false;
		}
		current.expiresAt = this.leases.now() + this.leases.ttlMs;
		return true;
	}

	async release({ tableId, epoch }: TableLease): Promise<void> {
		const current = this.leases.current(tableId);
		if (current?.instanceId === this.instanceId && current.epoch === epoch) {
			this.leases.held.delete(tableId);
			this.leases.leased.delete(tableId);
		}
	}

	async orphans(): Promise<readonly string[]> {
		return [...this.leases.leased].filter(
			(tableId) => !this.leases.current(tableId),
		);
	}
}

type Serve = Parameters<TableRequests["serve"]>[0];

/**
 * Requests between the instances of a test cluster, delivered in this process, through JSON as
 * over Redis. An instance in `stopped` answers nothing, as a stopped process.
 */
export class InMemoryRequestBus {
	readonly handlers = new Map<string, Serve>();
	readonly stopped = new Set<string>();

	forInstance(instanceId: string): TableRequests {
		return new InMemoryTableRequests(this, instanceId);
	}
}

class InMemoryTableRequests extends TableRequests {
	constructor(
		private readonly bus: InMemoryRequestBus,
		private readonly instanceId: string,
	) {
		super();
	}

	async send<R extends TableRequest>(
		to: string,
		request: R,
	): Promise<TableReplies[R["kind"]]> {
		const handler = this.bus.handlers.get(to);
		if (!handler || this.bus.stopped.has(to)) {
			throw new TableUnavailableError(request.tableId);
		}
		return (await handler(
			JSON.parse(JSON.stringify(request)) as TableRequest,
		)) as TableReplies[R["kind"]];
	}

	serve(handler: Serve): void {
		this.bus.handlers.set(this.instanceId, handler);
	}
}

/** No hand left unfinished, or the ones given. */
export class FixedUnfinishedTables extends UnfinishedTables {
	constructor(readonly tableIds: readonly string[] = []) {
		super();
	}

	async list(): Promise<readonly string[]> {
		return this.tableIds;
	}
}
