import { createLobbyTable, type NewTable } from "./lobby-table.js";
import { STAKE_PRESETS } from "./stake-presets.js";

const draft = (overrides: Partial<NewTable> = {}): NewTable => ({
	id: "t-1",
	name: "Friday game",
	presetId: "micro",
	maxSeats: 6,
	visibility: "public",
	creatorId: "u-1",
	createdAt: new Date(0),
	...overrides,
});

describe("createLobbyTable", () => {
	it("opens a table with a trimmed name, on the stakes it names", () => {
		const created = createLobbyTable(draft({ name: "  Friday game  " }));

		expect(created).toEqual({
			ok: true,
			value: {
				table: { ...draft(), status: "open" },
				preset: {
					id: "micro",
					smallBlind: 1,
					bigBlind: 2,
					minBuyInBigBlinds: 40,
					maxBuyInBigBlinds: 100,
				},
			},
		});
	});

	it("refuses an empty or too long name, and stakes it does not know", () => {
		const codeOf = (overrides: Partial<NewTable>) => {
			const created = createLobbyTable(draft(overrides));
			return created.ok ? null : [created.error.code, created.error.params];
		};
		expect(codeOf({ name: "   " })).toEqual([
			"lobby.invalid-name",
			{ min: 1, max: 40 },
		]);
		expect(codeOf({ name: "x".repeat(41) })?.[0]).toBe("lobby.invalid-name");
		expect(codeOf({ name: "x".repeat(40) })).toBeNull();
		expect(codeOf({ presetId: "nosebleed" })).toEqual([
			"lobby.unknown-preset",
			{ presetId: "nosebleed" },
		]);
	});
});

describe("STAKE_PRESETS", () => {
	it("double the small blind for the big one, from the smallest stakes", () => {
		expect(STAKE_PRESETS.map(({ id, bigBlind }) => [id, bigBlind])).toEqual([
			["micro", 2],
			["low", 10],
			["mid", 50],
			["high", 200],
		]);
	});
});
