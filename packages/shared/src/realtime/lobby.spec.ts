import { TableSummaryChangedV1 } from "../events/index.js";
import { LobbyTablesQuery } from "../contracts/lobby/index.js";
import { lobbyNamespace } from "./lobby.js";

describe("lobby realtime contracts", () => {
	it("watch the lobby, then get its tables as they change", () => {
		expect(Object.keys(lobbyNamespace.clientToServer)).toEqual([
			"watch",
			"unwatch",
		]);
		expect(Object.keys(lobbyNamespace.serverToClient)).toEqual([
			"table-upserted",
			"table-removed",
			"session-expired",
		]);
		const listing = {
			tableId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d",
			name: "Friday game",
			presetId: "low",
			smallBlind: 5,
			bigBlind: 10,
			maxSeats: 6,
			playerCount: 2,
			handsPlayed: 14,
		};
		expect(
			lobbyNamespace.serverToClient["table-upserted"].payload.parse(listing),
		).toEqual(listing);
	});

	it("filter the list by stakes, seats and free seats, from query strings", () => {
		expect(
			LobbyTablesQuery.parse({
				presetId: "low",
				maxSeats: "6",
				hasFreeSeat: "true",
			}),
		).toEqual({ presetId: "low", maxSeats: 6, hasFreeSeat: true });
		expect(LobbyTablesQuery.parse({})).toEqual({});
		expect(LobbyTablesQuery.safeParse({ maxSeats: "12" }).success).toBe(false);
	});

	it("describe a table's summary for the lobby", () => {
		const summary = {
			tableId: "t-1",
			status: "open",
			players: [{ seat: 0, userId: "u-1" }],
			handsSettled: 1,
		};
		expect(TableSummaryChangedV1.parse(summary)).toEqual(summary);
	});
});
