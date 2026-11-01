import { CreateDevTableRequest, CreateDevTableResponse } from "./index.js";

describe("table contracts", () => {
	it("takes any subset of the settings, leaving the rules to the api", () => {
		expect(CreateDevTableRequest.parse({})).toEqual({});
		expect(
			CreateDevTableRequest.parse({
				bigBlind: 10,
				maxSeats: 2,
				visibility: "private",
			}),
		).toEqual({ bigBlind: 10, maxSeats: 2, visibility: "private" });
		expect(CreateDevTableRequest.safeParse({ bigBlind: 1.5 }).success).toBe(
			false,
		);
		expect(
			CreateDevTableRequest.safeParse({ visibility: "secret" }).success,
		).toBe(false);
	});

	it("answers the new table's id", () => {
		const tableId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
		expect(CreateDevTableResponse.parse({ tableId })).toEqual({ tableId });
		expect(CreateDevTableResponse.safeParse({ tableId: "t-1" }).success).toBe(
			false,
		);
	});
});
