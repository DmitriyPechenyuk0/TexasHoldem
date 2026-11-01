import {
	createLobbyTable,
	type LobbyTable,
	mayJoin,
	type NewTable,
} from "./lobby-table.js";
import { STAKE_PRESETS } from "./stake-presets.js";

const draft = (overrides: Partial<NewTable> = {}): NewTable => ({
	id: "t-1",
	name: "Friday game",
	presetId: "micro",
	maxSeats: 6,
	visibility: "public",
	creatorId: "u-1",
	createdAt: new Date(0),
	inviteCode: "K7MPQ2XZ",
	...overrides,
});

describe("createLobbyTable", () => {
	it("opens a table with a trimmed name, on the stakes it names", () => {
		const created = createLobbyTable(draft({ name: "  Friday game  " }));

		expect(created).toEqual({
			ok: true,
			value: {
				table: {
					...draft(),
					status: "open",
					inviteCode: null,
					passwordHash: null,
					players: [],
					handsPlayed: 0,
				},
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

describe("private tables", () => {
	it("keep their invite code, and take a password of 4 to 64 characters", () => {
		const created = createLobbyTable(
			draft({ visibility: "private", password: "four" }),
		);
		expect(created.ok && created.value.table.inviteCode).toBe("K7MPQ2XZ");

		const codeOf = (overrides: Partial<NewTable>) => {
			const result = createLobbyTable(draft(overrides));
			return result.ok ? null : result.error.code;
		};
		expect(codeOf({ visibility: "private", password: "abc" })).toBe(
			"lobby.invalid-password",
		);
		expect(codeOf({ visibility: "private", password: "x".repeat(65) })).toBe(
			"lobby.invalid-password",
		);
		expect(codeOf({ password: "secret" })).toBe("lobby.password-needs-private");
	});

	it("take their creator and invited users; a public one takes anyone", () => {
		const table = {
			...draft({ visibility: "private" }),
			status: "open",
			passwordHash: null,
		} as LobbyTable;
		expect(mayJoin(table, "u-1", false)).toBe(true);
		expect(mayJoin(table, "u-2", true)).toBe(true);
		expect(mayJoin(table, "u-2", false)).toBe(false);
		expect(mayJoin({ ...table, visibility: "public" }, "u-2", false)).toBe(
			true,
		);
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
