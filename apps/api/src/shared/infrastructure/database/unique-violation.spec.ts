import { isUniqueViolation } from "./unique-violation.js";

const pgError = (code: string) =>
	Object.assign(new Error("duplicate key value"), { code });

describe("isUniqueViolation", () => {
	it("finds the driver's 23505 under drizzle's wrapper", () => {
		const wrapped = new Error("Failed query: update ...", {
			cause: pgError("23505"),
		});

		expect(isUniqueViolation(wrapped)).toBe(true);
		expect(isUniqueViolation(pgError("23505"))).toBe(true);
	});

	it.each([
		["another constraint", new Error("x", { cause: pgError("23503") })],
		["an error without a code", new Error("connection refused")],
		["something that is not an error", "23505"],
	])("is false for %s", (_case, error) => {
		expect(isUniqueViolation(error)).toBe(false);
	});
});
