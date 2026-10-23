import { z } from "zod";
import { MAX_PAGE_SIZE, PageQuery, pageOf } from "./pagination.js";

describe("PageQuery", () => {
	it("reads limit from query-string text and defaults it", () => {
		expect(PageQuery.parse({ limit: "50", cursor: "c1" })).toEqual({
			limit: 50,
			cursor: "c1",
		});
		expect(PageQuery.parse({})).toEqual({ limit: 20 });
	});

	it.each([
		["zero", "0"],
		["above the maximum", String(MAX_PAGE_SIZE + 1)],
		["not a number", "ten"],
		["fractional", "1.5"],
	])("rejects a limit that is %s", (_case, limit) => {
		expect(PageQuery.safeParse({ limit }).success).toBe(false);
	});

	it("rejects an empty cursor", () => {
		expect(PageQuery.safeParse({ cursor: "" }).success).toBe(false);
	});
});

describe("pageOf", () => {
	const NamesPage = pageOf(z.string());

	it("describes a page of items with the cursor of the next one", () => {
		expect(NamesPage.parse({ items: ["ann"], nextCursor: "c2" })).toEqual({
			items: ["ann"],
			nextCursor: "c2",
		});
		expect(
			NamesPage.parse({ items: [], nextCursor: null }).nextCursor,
		).toBeNull();
	});

	it("validates every item", () => {
		expect(NamesPage.safeParse({ items: [1], nextCursor: null }).success).toBe(
			false,
		);
	});
});
