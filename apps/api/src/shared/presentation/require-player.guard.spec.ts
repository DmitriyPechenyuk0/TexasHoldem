import type { ExecutionContext } from "@nestjs/common";
import { UserId } from "@holdem/shared";
import type { Viewer } from "../application/viewer.js";
import { problemFor } from "./problem.js";
import { RequirePlayer } from "./require-player.guard.js";

const viewer = (
	emailVerified: boolean,
	username: string | null = "alice",
): Viewer => ({
	userId: UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d"),
	username,
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
		new RequirePlayer().canActivate(context);
	} catch (error) {
		return problemFor(error).problem;
	}
	throw new Error("expected a refusal");
};

describe("RequirePlayer", () => {
	it.each([
		["without a username", viewer(true, null), "auth.username-required"],
		// The username comes first: the email link cannot help before it is chosen.
		["with neither", viewer(false, null), "auth.username-required"],
	])("refuses a viewer %s with %s", (_, who, code) => {
		expect(refusal(httpContext({ viewer: who }))).toMatchObject({
			status: 403,
			code,
		});
	});

	it("lets a verified viewer through, over HTTP and on a socket", () => {
		const guard = new RequirePlayer();

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
		expect(() => new RequirePlayer().canActivate(context)).toThrow(
			"RequirePlayer needs an authenticated viewer",
		);
	});
});
