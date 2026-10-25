import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
} from "@nestjs/common";
import { viewerOf } from "./auth.guard.js";
import { HttpProblem } from "./problem.js";

/**
 * Lets only viewers who may play through, for everything that touches play: a chosen username
 * and a verified email. An email and password session always has both, but an OAuth sign-in gets
 * a session before either: when the provider's handle could not be used, or its email was not
 * verified. HTTP: `@UseGuards(AuthGuard, RequirePlayer)`; a gateway handler needs only
 * `@UseGuards(RequirePlayer)`, since its socket was authenticated on connect.
 */
@Injectable()
export class RequirePlayer implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const viewer = viewerOf(context);
		if (!viewer) {
			throw new Error(
				"RequirePlayer needs an authenticated viewer: put AuthGuard first",
			);
		}
		if (viewer.username === null) {
			throw new HttpProblem(
				403,
				"auth.username-required",
				"Choose a username to continue.",
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
