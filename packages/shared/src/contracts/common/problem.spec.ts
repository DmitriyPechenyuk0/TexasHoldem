import { Problem, PROBLEM_CONTENT_TYPE } from "./problem.js";

describe("Problem", () => {
	it("describes an RFC 9457 problem with our stable code", () => {
		const problem = {
			type: "about:blank",
			title: "Conflict",
			status: 409,
			detail: "Seat 3 is taken",
			code: "table.seat-taken",
		};

		expect(Problem.parse(problem)).toEqual(problem);
		expect(PROBLEM_CONTENT_TYPE).toBe("application/problem+json");
	});

	it("lists the invalid parts of a request", () => {
		expect(
			Problem.parse({
				type: "about:blank",
				title: "Bad Request",
				status: 400,
				code: "request.invalid",
				errors: [
					{ path: ["seats", 0], code: "too_small", message: "Too small" },
				],
			}).errors,
		).toEqual([
			{ path: ["seats", 0], code: "too_small", message: "Too small" },
		]);
	});

	it("carries interpolation params for the translated message and the request id", () => {
		expect(
			Problem.parse({
				type: "about:blank",
				title: "Conflict",
				status: 409,
				code: "table.seat-taken",
				params: { seat: 3, table: "Main" },
				requestId: "edge-7f3a",
			}),
		).toMatchObject({
			params: { seat: 3, table: "Main" },
			requestId: "edge-7f3a",
		});
	});

	it("only describes error statuses and always carries a code", () => {
		const base = { type: "about:blank", title: "OK", code: "x" };
		expect(Problem.safeParse({ ...base, status: 200 }).success).toBe(false);
		expect(Problem.safeParse({ ...base, status: 600 }).success).toBe(false);
		expect(
			Problem.safeParse({ type: "about:blank", title: "Gone", status: 410 })
				.success,
		).toBe(false);
	});
});
