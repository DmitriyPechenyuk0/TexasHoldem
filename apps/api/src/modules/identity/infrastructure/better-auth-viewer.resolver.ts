import type { IncomingHttpHeaders } from "node:http";
import { UserId } from "@holdem/shared";
import { Inject, Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import {
	type RequestHeaders,
	type Viewer,
	ViewerResolver,
} from "@/shared/application/viewer.js";
import { BETTER_AUTH, type BetterAuth } from "./better-auth.js";

@Injectable()
export class BetterAuthViewerResolver extends ViewerResolver {
	constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuth) {
		super();
	}

	async resolve(headers: RequestHeaders): Promise<Viewer | null> {
		const session = await this.auth.api.getSession({
			headers: fromNodeHeaders(headers as IncomingHttpHeaders),
		});
		if (!session) {
			return null;
		}
		return {
			userId: UserId.parse(session.user.id),
			// Always set for our accounts; `name` mirrors it.
			username: session.user.username ?? session.user.name,
			emailVerified: session.user.emailVerified,
		};
	}
}
