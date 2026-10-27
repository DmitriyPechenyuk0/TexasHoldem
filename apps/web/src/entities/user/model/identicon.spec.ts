import { IDENTICON_SIZE, identicon } from "./identicon";

describe("identicon", () => {
	it("is the same for the same seed", () => {
		expect(identicon("ada_1815")).toEqual(identicon("ada_1815"));
	});

	it("differs between seeds, in colour or pattern", () => {
		const seen = new Set(
			["alice", "bob", "carol", "dave", "erin", "frank"].map((seed) =>
				JSON.stringify(identicon(seed)),
			),
		);

		expect(seen.size).toBe(6);
	});

	it("is a 5×5 grid, mirrored left to right, with a hue on the colour wheel", () => {
		const { hue, cells } = identicon("doyle");

		expect(cells).toHaveLength(IDENTICON_SIZE);
		for (const row of cells) {
			expect(row).toHaveLength(IDENTICON_SIZE);
			expect(row).toEqual([...row].reverse());
		}
		expect(hue).toBeGreaterThanOrEqual(0);
		expect(hue).toBeLessThan(360);
	});
});
