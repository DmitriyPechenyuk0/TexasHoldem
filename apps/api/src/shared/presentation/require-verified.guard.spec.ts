import type { ExecutionContext } from "@nestjs/common";
import { UserId } from "@holdem/shared";
import type { Viewer } from "../application/viewer.js";
import { problemFor } from "./problem.js";
import { RequireVerified } from "./require-verified.guard.js";

const viewer = (emailVerified: boolean): Viewer => ({
	userId: UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d"),
	username: "alice",
	emailVerified,
});

const httpContext = (request: object) =>
	({
		getType: () => "http",
		switchToHttp: () => ({ getRequest: () => request }),
	}) as ExecutionContext;

const wsContext = (client: object) =>
	({
		getType: () => "ws",
		switchToWs: () => ({ getClient: () => client }),
	}) as ExecutionContext;

const refusal = (context: ExecutionContext) => {
	try {
		new RequireVerified().canActivate(context);
	} catch (error) {
		return problemFor(error).problem;
	}
	throw new Error("expected a refusal");
};

describe("RequireVerified", () => {
	it("lets a verified viewer through, over HTTP and on a socket", () => {
		const guard = new RequireVerified();

		expect(guard.canActivate(httpContext({ viewer: viewer(true) }))).toBe(true);
		expect(
			guard.canActivate(wsContext({ data: { viewer: viewer(true) } })),
		).toBe(true);
	});

	it.each([
		["over HTTP", httpContext({ viewer: viewer(false) })],
		["on a socket", wsContext({ data: { viewer: viewer(false) } })],
	])("refuses an unverified viewer %s with a stable code", (_, context) => {
		expect(refusal(context)).toMatchObject({
			status: 403,
			code: "auth.email-not-verified",
		});
	});

	it.each([
		["a request without AuthGuard", httpContext({})],
		["an unauthenticated socket", wsContext({})],
	])("fails loudly on %s", (_, context) => {
		expect(() => new RequireVerified().canActivate(context)).toThrow(
			"RequireVerified needs an authenticated viewer",
		);
	});
});
