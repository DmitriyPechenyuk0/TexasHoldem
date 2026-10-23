import { requestIdFor } from "./request-id.js";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("requestIdFor", () => {
	it("keeps a plain id from the incoming header", () => {
		expect(requestIdFor("lb-7f3a:42")).toBe("lb-7f3a:42");
	});

	it.each([
		["a missing header", undefined],
		["an empty header", ""],
		["a repeated header", ["a", "b"]],
		["an id with spaces or markup", "id <script>"],
		["an overly long id", "x".repeat(129)],
	])("generates a UUID for %s", (_case, header) => {
		expect(requestIdFor(header)).toMatch(UUID);
	});
});
