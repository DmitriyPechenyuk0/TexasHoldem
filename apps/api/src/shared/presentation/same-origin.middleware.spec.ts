import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpProblem } from "./problem.js";
import { sameOriginOnly } from "./same-origin.middleware.js";

const check = sameOriginOnly("http://localhost:3000");

const run = (method: string | undefined, origin?: string) => {
	const next = vi.fn();
	const request = {
		method,
		headers: origin ? { origin } : {},
	} as IncomingMessage;
	check(request, {} as ServerResponse, next);
	return next;
};

describe("sameOriginOnly", () => {
	it.each(["GET", "HEAD", "OPTIONS", undefined])(
		"lets a %s request from anywhere through",
		(method) => {
			expect(run(method, "https://evil.example")).toHaveBeenCalledOnce();
		},
	);

	it("lets a state-changing request from the web app through", () => {
		expect(run("POST", "http://localhost:3000")).toHaveBeenCalledOnce();
	});

	it("lets a request without Origin through: it is not from a browser", () => {
		expect(run("DELETE")).toHaveBeenCalledOnce();
	});

	it.each([
		"https://evil.example",
		"http://localhost:3000.evil.example",
		"http://localhost:4000",
		"null",
	])("refuses a state-changing request from %s", (origin) => {
		expect(() => run("POST", origin)).toThrow(
			expect.objectContaining({
				constructor: HttpProblem,
				code: "request.cross-origin",
			}),
		);
	});
});
