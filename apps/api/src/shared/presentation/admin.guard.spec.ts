import type { ExecutionContext } from "@nestjs/common";
import type { UserId } from "@holdem/shared";
import type { Viewer } from "@/shared/application/viewer.js";
import { AdminGuard } from "./admin.guard.js";

const contextFor = (viewer: Viewer | null) =>
	({
		getType: () => "http",
		switchToHttp: () => ({ getRequest: () => ({ viewer }) }),
	}) as unknown as ExecutionContext;

const viewer = (role: Viewer["role"]): Viewer => ({
	userId: "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d" as UserId,
	username: "alice",
	emailVerified: true,
	role,
});

describe("AdminGuard", () => {
	it("lets admins through, and refuses everyone else with auth.admin-only", () => {
		const guard = new AdminGuard();

		expect(guard.canActivate(contextFor(viewer("admin")))).toBe(true);
		expect(() => guard.canActivate(contextFor(viewer("user")))).toThrow(
			expect.objectContaining({ code: "auth.admin-only" }),
		);
	});

	it("needs AuthGuard before it", () => {
		expect(() => new AdminGuard().canActivate(contextFor(null))).toThrow(
			"AdminGuard needs an authenticated viewer",
		);
	});
});
