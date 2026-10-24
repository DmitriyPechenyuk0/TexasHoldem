import { Chips, TableId } from "@holdem/shared";
import { z } from "zod";
import {
	RequestValidationError,
	ZodValidationPipe,
} from "./request-validation.js";

const TakeSeat = z.object({ seat: z.int().min(1).max(9), buyIn: Chips });

const issuesOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		if (error instanceof RequestValidationError) return error.issues;
		throw error;
	}
	throw new Error("expected a RequestValidationError");
};

describe("ZodValidationPipe", () => {
	it("hands the parsed value to the handler", () => {
		expect(
			new ZodValidationPipe(TakeSeat).transform({ seat: 3, buyIn: 1000 }),
		).toEqual({ seat: 3, buyIn: 1000 });
	});

	it("lists every invalid field with its path, zod code and message", () => {
		expect(
			issuesOf(() =>
				new ZodValidationPipe(TakeSeat).transform({ seat: 12, buyIn: -5 }),
			),
		).toEqual([
			{ path: ["seat"], code: "too_big", message: expect.any(String) },
			{ path: ["buyIn"], code: "too_small", message: expect.any(String) },
		]);
	});

	it("points route-param issues at the parameter name", () => {
		expect(
			issuesOf(() =>
				new ZodValidationPipe(TableId, ["tableId"]).transform("t1"),
			),
		).toEqual([
			{
				path: ["tableId"],
				code: "invalid_format",
				message: expect.any(String),
			},
		]);
	});
});
