import { Logger } from "@nestjs/common";
import { DomainError } from "@/shared/domain/domain-error.js";
import type {
	Redis,
	RedisConnections,
} from "@/shared/infrastructure/redis/index.js";
import { NotSeatedError } from "../domain/table-errors.js";
import {
	TableMovedError,
	TableUnavailableError,
} from "../application/runtime/table-routing-errors.js";
import type { TableLeases } from "../application/table-leases.js";
import type { TableRequest } from "../application/table-requests.js";
import {
	RedisTableRequests,
	TABLE_REQUEST_TIMEOUT_MS,
} from "./redis-table-requests.js";

/** Redis pub/sub in memory: what is published reaches every listener of the channel. */
class Broker {
	readonly listeners = new Map<string, ((message: string) => void)[]>();
	failPublishes = false;

	client(): Redis {
		return {
			publish: async (channel: string, message: string) => {
				if (this.failPublishes) {
					throw new Error("The client is closed");
				}
				const listeners = this.listeners.get(channel) ?? [];
				queueMicrotask(() => {
					for (const listener of listeners) listener(message);
				});
				return listeners.length;
			},
			subscribe: async (
				channel: string,
				listener: (message: string) => void,
			) => {
				this.listeners.set(channel, [
					...(this.listeners.get(channel) ?? []),
					listener,
				]);
			},
		} as unknown as Redis;
	}
}

async function instance(broker: Broker, instanceId: string) {
	const client = broker.client();
	const requests = new RedisTableRequests(
		client,
		{ open: () => client } as unknown as RedisConnections,
		{ instanceId } as TableLeases,
	);
	await requests.onModuleInit();
	return requests;
}

const view: TableRequest = { kind: "view", tableId: "t-1", userId: "u0" };

describe("RedisTableRequests", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("sends a request to the instance named, and answers its reply", async () => {
		const broker = new Broker();
		const [a, b] = [await instance(broker, "a"), await instance(broker, "b")];
		const served: TableRequest[] = [];
		b.serve(async (request) => {
			served.push(request);
			return true;
		});

		await expect(a.send("b", { kind: "deal", tableId: "t-1" })).resolves.toBe(
			true,
		);
		expect(served).toEqual([{ kind: "deal", tableId: "t-1" }]);
	});

	it("brings the server's errors back as they were thrown there", async () => {
		const broker = new Broker();
		const [a, b] = [await instance(broker, "a"), await instance(broker, "b")];
		const failures: Error[] = [
			new NotSeatedError(),
			new TableMovedError("t-1"),
			new TableUnavailableError("t-1"),
			new Error("database down"),
		];
		b.serve(async () => {
			throw failures.shift();
		});

		const notSeated = await a.send("b", view).catch((error: unknown) => error);
		expect(notSeated).toBeInstanceOf(DomainError);
		expect(notSeated).toMatchObject({
			kind: "rule-violation",
			code: "table.not-seated",
		});
		await expect(a.send("b", view)).rejects.toBeInstanceOf(TableMovedError);
		await expect(a.send("b", view)).rejects.toBeInstanceOf(
			TableUnavailableError,
		);
		const plain = await a.send("b", view).catch((error: unknown) => error);
		expect(plain).not.toBeInstanceOf(DomainError);
		expect(plain).toMatchObject({ message: "database down" });
	});

	it("fails at once for an instance nobody listens for, and an instance not serving yet", async () => {
		const broker = new Broker();
		const a = await instance(broker, "a");
		await instance(broker, "b");

		await expect(a.send("gone", view)).rejects.toBeInstanceOf(
			TableUnavailableError,
		);
		await expect(a.send("b", view)).rejects.toMatchObject({
			code: "table.unavailable",
		});
	});

	it("gives up on a request nobody answers in time", async () => {
		vi.useFakeTimers();
		const broker = new Broker();
		const a = await instance(broker, "a");
		broker.listeners.set("table-requests:silent", [() => undefined]);

		const sent = a.send("silent", view).catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(TABLE_REQUEST_TIMEOUT_MS);

		expect(await sent).toBeInstanceOf(TableUnavailableError);
	});

	it("passes on a failed publish, and warns when a reply cannot be sent", async () => {
		vi.useFakeTimers();
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {});
		const broker = new Broker();
		const [a, b] = [await instance(broker, "a"), await instance(broker, "b")];
		b.serve(async () => {
			broker.failPublishes = true;
			return true;
		});

		// The reply is lost, so the request runs out of time.
		const sent = a
			.send("b", { kind: "deal", tableId: "t-1" })
			.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(TABLE_REQUEST_TIMEOUT_MS);
		expect(await sent).toBeInstanceOf(TableUnavailableError);
		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "table reply not sent" }),
		);
		await expect(a.send("b", view)).rejects.toThrow("The client is closed");
	});
});
