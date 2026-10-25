import { PROBLEM_CONTENT_TYPE, Problem } from "@holdem/shared";
import { asProblem } from "./auth.middleware.js";

const context = { instance: "/api/auth/sign-in/email", requestId: "r-1" };

const json = (
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});

describe("asProblem", () => {
	it("passes a successful answer through untouched", async () => {
		const response = json(200, { token: null });

		expect(await asProblem(response, context)).toBe(response);
	});

	it("turns a Better Auth error code into a problem code, keeping the headers", async () => {
		const response = await asProblem(
			json(
				400,
				{
					code: "USERNAME_IS_ALREADY_TAKEN",
					message: "Username is already taken.",
				},
				{ "set-cookie": "a=b" },
			),
			context,
		);

		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
		expect(response.headers.get("set-cookie")).toBe("a=b");
		expect(Problem.parse(await response.json())).toEqual({
			type: "about:blank",
			title: "Bad Request",
			status: 400,
			code: "auth.username-is-already-taken",
			detail: "Username is already taken.",
			instance: "/api/auth/sign-in/email",
			requestId: "r-1",
		});
	});

	it("maps an answer without a code by its status", async () => {
		const response = await asProblem(
			new Response("slow down", {
				status: 429,
				headers: { "x-retry-after": "7" },
			}),
			context,
		);

		expect(response.headers.get("x-retry-after")).toBe("7");
		expect(await response.json()).toMatchObject({
			status: 429,
			code: "request.rate-limited",
			detail: "Too Many Requests",
		});
	});

	it("never passes a server error's message on", async () => {
		const response = await asProblem(
			json(500, {
				code: "FAILED_TO_CREATE_USER",
				message: "duplicate key value",
			}),
			context,
		);

		const problem = Problem.parse(await response.json());
		expect(problem).toMatchObject({ status: 500, code: "internal" });
		expect(problem.detail).toBeUndefined();
	});
});
