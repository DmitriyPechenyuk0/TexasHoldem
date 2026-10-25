import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
} from "@nestjs/common";
import { viewerOf } from "./auth.guard.js";
import { HttpProblem } from "./problem.js";

/**
 * Lets only viewers with a verified email through, for everything that touches play. An
 * email and password session is always verified, but an OAuth provider may hand over an unverified
 * email and still get one. HTTP: `@UseGuards(AuthGuard, RequireVerified)`; a gateway handler needs
 * only `@UseGuards(RequireVerified)`, since its socket was authenticated on connect.
 */
@Injectable()
export class RequireVerified implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const viewer = viewerOf(context);
		if (!viewer) {
			throw new Error(
				"RequireVerified needs an authenticated viewer: put AuthGuard first",
			);
		}
		if (!viewer.emailVerified) {
			throw new HttpProblem(
				403,
				"auth.email-not-verified",
				"Verify your email to continue.",
			);
		}
		return true;
	}
}
