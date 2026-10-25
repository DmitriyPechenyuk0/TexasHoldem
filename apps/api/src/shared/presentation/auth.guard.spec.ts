import { UnauthorizedException } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import type { ExecutionContext } from "@nestjs/common";
import { UserId } from "@holdem/shared";
import { type Viewer, ViewerResolver } from "../application/viewer.js";
import { AuthGuard, CurrentUser } from "./auth.guard.js";

const viewer: Viewer = {
	userId: UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d"),
	username: "alice",
	emailVerified: true,
};

const contextFor = (request: object) =>
	({
		switchToHttp: () => ({ getRequest: () => request }),
	}) as ExecutionContext;

class Resolver extends ViewerResolver {
	constructor(private readonly viewer: Viewer | null) {
		super();
	}

	async resolve(): Promise<Viewer | null> {
		return this.viewer;
	}
}

/** The function Nest calls to fill a `@CurrentUser()` parameter. */
function currentUserFactory(): (
	data: unknown,
	context: ExecutionContext,
) => unknown {
	class Probe {
		handle(@CurrentUser() viewer: Viewer) {
			return viewer;
		}
	}
	const metadata = Reflect.getMetadata(
		ROUTE_ARGS_METADATA,
		Probe,
		"handle",
	) as Record<
		string,
		{ factory: (data: unknown, context: ExecutionContext) => unknown }
	>;
	return Object.values(metadata)[0]!.factory;
}

describe("AuthGuard", () => {
	it("lets a request with a session through and keeps its viewer", async () => {
		const request = { headers: { cookie: "holdem.session_token=x" } };

		await expect(
			new AuthGuard(new Resolver(viewer)).canActivate(contextFor(request)),
		).resolves.toBe(true);
		expect(currentUserFactory()(undefined, contextFor(request))).toEqual(
			viewer,
		);
	});

	it("refuses a request without a session with 401", async () => {
		await expect(
			new AuthGuard(new Resolver(null)).canActivate(
				contextFor({ headers: {} }),
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it("@CurrentUser() fails loudly on a route without the guard", () => {
		expect(() =>
			currentUserFactory()(undefined, contextFor({ headers: {} })),
		).toThrow("@CurrentUser() needs @UseGuards(AuthGuard)");
	});
});
