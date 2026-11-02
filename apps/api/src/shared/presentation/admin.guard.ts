import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
} from "@nestjs/common";
import { viewerOf } from "./auth.guard.js";
import { HttpProblem } from "./problem.js";

/**
 * Lets only admins through (POK-114), after `AuthGuard`: `@UseGuards(AuthGuard, AdminGuard)`. The
 * role is read with the session on every request, so taking it away takes effect at once.
 */
@Injectable()
export class AdminGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const viewer = viewerOf(context);
		if (!viewer) {
			throw new Error(
				"AdminGuard needs an authenticated viewer: put AuthGuard first",
			);
		}
		if (viewer.role !== "admin") {
			throw new HttpProblem(403, "auth.admin-only", "For admins only.");
		}
		return true;
	}
}
