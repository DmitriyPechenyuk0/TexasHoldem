import { CreateTableRequest, StakePresetsResponse } from "./index.js";

describe("lobby contracts", () => {
	it("take a table's name, stakes, seats, visibility and turn time", () => {
		const request = {
			name: "Friday game",
			presetId: "micro",
			maxSeats: 6,
			visibility: "private",
			turnSeconds: 30,
		};
		expect(CreateTableRequest.parse(request)).toEqual(request);
		const { turnSeconds: _, ...withoutTurn } = request;
		expect(CreateTableRequest.safeParse(withoutTurn).success).toBe(true);
		for (const wrong of [
			{ maxSeats: 1 },
			{ maxSeats: 10 },
			{ visibility: "hidden" },
			{ turnSeconds: 4 },
			{ presetId: "" },
		]) {
			expect(
				CreateTableRequest.safeParse({ ...request, ...wrong }).success,
			).toBe(false);
		}
	});

	it("list stake presets", () => {
		const presets = [
			{
				id: "micro",
				smallBlind: 1,
				bigBlind: 2,
				minBuyInBigBlinds: 40,
				maxBuyInBigBlinds: 100,
			},
		];
		expect(StakePresetsResponse.parse(presets)).toEqual(presets);
	});
});
