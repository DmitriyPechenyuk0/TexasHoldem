import { randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
	DomainError,
	type DomainErrorKind,
	type DomainErrorParams,
} from "@/shared/domain/domain-error.js";
import {
	InjectRedis,
	type Redis,
	RedisConnections,
} from "@/shared/infrastructure/redis/index.js";
import {
	TableMovedError,
	TableUnavailableError,
} from "../application/runtime/table-routing-errors.js";
import { TableLeases } from "../application/table-leases.js";
import {
	type TableReplies,
	type TableRequest,
	TableRequests,
} from "../application/table-requests.js";

/** How long a request waits for the table's holder to answer. */
export const TABLE_REQUEST_TIMEOUT_MS = 5_000;

const requestsOf = (instanceId: string) => `table-requests:${instanceId}`;
const repliesOf = (instanceId: string) => `table-replies:${instanceId}`;

interface Envelope {
	readonly id: string;
	readonly from: string;
	readonly request: TableRequest;
}

type Reply =
	| { readonly id: string; readonly ok: true; readonly value: unknown }
	| {
			readonly id: string;
			readonly ok: false;
			readonly error: {
				readonly kind?: DomainErrorKind;
				readonly code?: string;
				readonly message: string;
				readonly params?: DomainErrorParams;
			};
	  };

/** A `DomainError` thrown on the instance that served the request, as the caller gets it. */
class ForwardedError extends DomainError {
	constructor(
		readonly kind: DomainErrorKind,
		readonly code: string,
		message: string,
		params?: DomainErrorParams,
	) {
		super(message, { params });
	}
}

/**
 * Requests between instances over Redis pub/sub: each instance listens on `table-requests:<id>`
 * and gets its answers on `table-replies:<id>`, on a connection of its own. A request nobody
 * listens for (its instance stopped) fails at once; one unanswered within 5 s fails then.
 */
@Injectable()
export class RedisTableRequests extends TableRequests implements OnModuleInit {
	private readonly logger = new Logger(TableRequests.name);
	private readonly subscriber: Redis;
	private readonly pending = new Map<
		string,
		{ resolve: (reply: Reply) => void; timer: ReturnType<typeof setTimeout> }
	>();
	private handler:
		| ((request: TableRequest) => Promise<TableReplies[TableRequest["kind"]]>)
		| null = null;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		connections: RedisConnections,
		private readonly leases: TableLeases,
	) {
		super();
		this.subscriber = connections.open("table-requests");
	}

	async onModuleInit(): Promise<void> {
		const { instanceId } = this.leases;
		await this.subscriber.subscribe(requestsOf(instanceId), (message) => {
			void this.answer(message);
		});
		await this.subscriber.subscribe(repliesOf(instanceId), (message) =>
			this.settle(message),
		);
	}

	async send<R extends TableRequest>(
		instanceId: string,
		request: R,
	): Promise<TableReplies[R["kind"]]> {
		const id = randomUUID();
		const reply = new Promise<Reply>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve({
					id,
					ok: false,
					error: {
						kind: "conflict",
						code: "table.unavailable",
						message: "No answer",
					},
				});
			}, TABLE_REQUEST_TIMEOUT_MS);
			this.pending.set(id, { resolve, timer });
		});
		const envelope: Envelope = { id, from: this.leases.instanceId, request };
		const listeners = await this.redis
			.publish(requestsOf(instanceId), JSON.stringify(envelope))
			.catch((error: unknown) => {
				this.drop(id);
				throw error;
			});
		if (listeners === 0) {
			this.drop(id);
			throw new TableUnavailableError(request.tableId);
		}
		const answer = await reply;
		if (answer.ok) {
			return answer.value as TableReplies[R["kind"]];
		}
		throw this.errorOf(answer.error, request.tableId);
	}

	serve(
		handler: (
			request: TableRequest,
		) => Promise<TableReplies[TableRequest["kind"]]>,
	): void {
		this.handler = handler;
	}

	/** Serves a request, and sends its answer back to the instance that asked. */
	private async answer(message: string): Promise<void> {
		const { id, from, request } = JSON.parse(message) as Envelope;
		let reply: Reply;
		try {
			if (!this.handler) {
				throw new TableUnavailableError(request.tableId);
			}
			reply = { id, ok: true, value: await this.handler(request) };
		} catch (error) {
			reply = {
				id,
				ok: false,
				error:
					error instanceof DomainError
						? {
								kind: error.kind,
								code: error.code,
								message: error.message,
								params: error.params,
							}
						: { message: (error as Error).message },
			};
		}
		await this.redis
			.publish(repliesOf(from), JSON.stringify(reply))
			.catch((error: unknown) => {
				this.logger.warn({ msg: "table reply not sent", err: error });
			});
	}

	private settle(message: string): void {
		const reply = JSON.parse(message) as Reply;
		const waiting = this.pending.get(reply.id);
		if (waiting) {
			this.drop(reply.id);
			waiting.resolve(reply);
		}
	}

	private drop(id: string): void {
		const waiting = this.pending.get(id);
		if (waiting) {
			clearTimeout(waiting.timer);
			this.pending.delete(id);
		}
	}

	private errorOf(
		error: Extract<Reply, { ok: false }>["error"],
		tableId: string,
	): Error {
		if (error.code === "table.moved") {
			return new TableMovedError(tableId);
		}
		if (error.code === "table.unavailable") {
			return new TableUnavailableError(tableId);
		}
		if (error.kind && error.code) {
			return new ForwardedError(
				error.kind,
				error.code,
				error.message,
				error.params,
			);
		}
		return new Error(error.message);
	}
}
