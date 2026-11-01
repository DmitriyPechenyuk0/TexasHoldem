import { Subject } from "rxjs";
import type { EventBus, QueryBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import { privateTable } from "../application/commands/in-memory-lobby.js";
import { LobbyTableChanged } from "../application/events/lobby-table-changed.event.js";
import { LOBBY_UPDATE_EVERY_MS, LobbyGateway } from "./lobby.gateway.js";

function setUp() {
	vi.useFakeTimers();
	const events = new Subject<unknown>();
	const emitted: [string, unknown][] = [];
	const gateway = new LobbyGateway(
		{} as QueryBus,
		events as unknown as EventBus,
		{ now: () => new Date(Date.now()) } as Clock,
	);
	(gateway as unknown as { server: unknown }).server = {
		to: () => ({
			emit: (event: string, payload: unknown) => emitted.push([event, payload]),
		}),
	};
	gateway.onModuleInit();
	const change = (overrides: Parameters<typeof privateTable>[0]) =>
		events.next(
			new LobbyTableChanged(
				privateTable({ visibility: "public", inviteCode: null, ...overrides }),
			),
		);
	return { gateway, emitted, change };
}

describe("LobbyGateway", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends a table's changes at most twice a second, the last one always", async () => {
		const { gateway, emitted, change } = setUp();

		change({ handsPlayed: 1 });
		change({ handsPlayed: 2 });
		change({ handsPlayed: 3 });
		expect(emitted.map(([, listing]) => listing)).toEqual([
			expect.objectContaining({ tableId: "t-1", handsPlayed: 1 }),
		]);

		await vi.advanceTimersByTimeAsync(LOBBY_UPDATE_EVERY_MS);
		expect(emitted.map(([, listing]) => listing)).toEqual([
			expect.objectContaining({ handsPlayed: 1 }),
			expect.objectContaining({ handsPlayed: 3 }),
		]);
		gateway.onModuleDestroy();
	});

	it("tells of a closed table at once, and never of a private one", async () => {
		const { gateway, emitted, change } = setUp();

		change({ handsPlayed: 1 });
		change({ handsPlayed: 2 });
		change({ status: "closed" });
		change({ id: "t-2", visibility: "private" });
		await vi.advanceTimersByTimeAsync(LOBBY_UPDATE_EVERY_MS);

		expect(emitted).toEqual([
			["table-upserted", expect.objectContaining({ tableId: "t-1" })],
			["table-removed", { tableId: "t-1" }],
		]);
		gateway.onModuleDestroy();
	});
});
