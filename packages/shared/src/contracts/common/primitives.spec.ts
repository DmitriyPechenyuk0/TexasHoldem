import { Chips } from "./chips.js";
import { HandId, TableId, UserId } from "./ids.js";
import { Locale } from "./locale.js";

const uuid = "0b8f6a52-7c1e-4d3a-9f2b-5e6c7d8a9b0c";

describe("ids", () => {
	it.each([
		["UserId", UserId],
		["TableId", TableId],
		["HandId", HandId],
	])("%s accepts a UUID and rejects anything else", (_name, schema) => {
		expect(schema.parse(uuid)).toBe(uuid);
		expect(schema.safeParse("table-1").success).toBe(false);
		expect(schema.safeParse("").success).toBe(false);
	});

	it("keeps ids of different kinds apart at compile time", () => {
		const tableId = TableId.parse(uuid);
		const takeSeat = (userId: UserId) => userId;

		// @ts-expect-error A TableId is not a UserId.
		takeSeat(tableId);
		// @ts-expect-error A plain string is not a UserId either.
		takeSeat(uuid);
		expect(takeSeat(UserId.parse(uuid))).toBe(uuid);
	});
});

describe("Chips", () => {
	it("accepts whole non-negative amounts", () => {
		expect(Chips.parse(0)).toBe(0);
		expect(Chips.parse(1500)).toBe(1500);
	});

	it.each([
		["negative", -1],
		["fractional", 2.5],
		["unsafe", Number.MAX_SAFE_INTEGER + 1],
		["text", "100"],
	])("rejects %s amounts", (_case, value) => {
		expect(Chips.safeParse(value).success).toBe(false);
	});
});

describe("Locale", () => {
	it("is ru or en", () => {
		expect(Locale.options).toEqual(["ru", "en"]);
		expect(Locale.safeParse("de").success).toBe(false);
	});
});
