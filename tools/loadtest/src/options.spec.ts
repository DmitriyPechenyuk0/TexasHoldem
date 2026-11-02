import { parseOptions } from "./options.ts";

describe("parseOptions", () => {
	it("defaults to 20 tables of 6 for 10 minutes on ports 4101 and 4102", () => {
		expect(parseOptions([])).toEqual({
			tables: 20,
			players: 6,
			minutes: 10,
			thinkMs: [200, 800],
			chaos: false,
			ports: [4101, 4102],
		});
	});

	it("reads every option", () => {
		expect(
			parseOptions([
				"--tables",
				"2",
				"--players",
				"3",
				"--minutes",
				"0.5",
				"--think",
				"0-0",
				"--chaos",
				"--port",
				"5000",
			]),
		).toEqual({
			tables: 2,
			players: 3,
			minutes: 0.5,
			thinkMs: [0, 0],
			chaos: true,
			ports: [5000, 5001],
		});
	});

	it("refuses what makes no sense", () => {
		expect(() => parseOptions(["--tables", "0"])).toThrow("--tables");
		expect(() => parseOptions(["--players", "10"])).toThrow("--players");
		expect(() => parseOptions(["--think", "9-1"])).toThrow("--think");
		expect(() => parseOptions(["--bogus"])).toThrow();
	});
});
