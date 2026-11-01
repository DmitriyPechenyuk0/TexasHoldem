import { tableConfig } from "../../../../test/support/table.js";
import {
	buyInRange,
	MAX_TABLE_SEATS,
	type TableConfig,
	validateTableConfig,
} from "./table-config.js";

describe("validateTableConfig", () => {
	it("accepts a valid config", () => {
		expect(validateTableConfig(tableConfig())).toBeNull();
		expect(
			validateTableConfig(
				tableConfig({
					smallBlind: 2,
					bigBlind: 2,
					minBuyInBigBlinds: 100,
					maxBuyInBigBlinds: 100,
					maxSeats: 2,
					turnSeconds: 5,
					timeBankSeconds: 0,
					visibility: "private",
				}),
			),
		).toBeNull();
		expect(
			validateTableConfig(
				tableConfig({ maxSeats: 9, turnSeconds: 120, timeBankSeconds: 600 }),
			),
		).toBeNull();
	});

	it.each<[string, Partial<TableConfig>]>([
		["blinds", { smallBlind: 0 }],
		["blinds", { bigBlind: 0 }],
		["blinds", { smallBlind: 1.5 }],
		["blinds", { smallBlind: 3, bigBlind: 2 }],
		["buy-in", { minBuyInBigBlinds: 0 }],
		["buy-in", { maxBuyInBigBlinds: 2.5 }],
		["buy-in", { minBuyInBigBlinds: 201 }],
		["buy-in", { bigBlind: 2 ** 50, smallBlind: 1 }],
		["seats", { maxSeats: 1 }],
		["seats", { maxSeats: 10 }],
		["seats", { maxSeats: 6.5 }],
		["turn-time", { turnSeconds: 4 }],
		["turn-time", { turnSeconds: 121 }],
		["time-bank", { timeBankSeconds: -1 }],
		["time-bank", { timeBankSeconds: 601 }],
		["time-bank", { timeBankSeconds: Number.NaN }],
		["visibility", { visibility: "hidden" as TableConfig["visibility"] }],
	])("refuses %s in %o", (reason, overrides) => {
		expect(validateTableConfig(tableConfig(overrides))).toBe(reason);
	});

	it("keeps the chips of a full table at the largest buy-in a safe integer", () => {
		const bigBlind = Math.floor(
			Number.MAX_SAFE_INTEGER / MAX_TABLE_SEATS / 200,
		);

		expect(validateTableConfig(tableConfig({ bigBlind }))).toBeNull();
		expect(validateTableConfig(tableConfig({ bigBlind: bigBlind + 1 }))).toBe(
			"buy-in",
		);
	});
});

describe("buyInRange", () => {
	it("turns the range in big blinds into chips", () => {
		expect(buyInRange(tableConfig())).toEqual({ min: 100, max: 400 });
	});
});
