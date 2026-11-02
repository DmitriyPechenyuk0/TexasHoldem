import { startingWith } from "./like-prefix.js";

describe("startingWith", () => {
	it("matches the prefix literally, wildcards included", () => {
		expect(startingWith("al")).toBe("al%");
		expect(startingWith("a_b%c\\")).toBe("a\\_b\\%c\\\\%");
	});
});
