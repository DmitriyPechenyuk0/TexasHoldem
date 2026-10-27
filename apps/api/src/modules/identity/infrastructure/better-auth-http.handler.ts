import { setTimeout } from "node:timers/promises";
import { Inject, Injectable } from "@nestjs/common";
import {
	AUTH_BASE_PATH,
	AuthHttpHandler,
} from "../application/auth-http-handler.js";
import { BETTER_AUTH, type BetterAuth } from "./better-auth.js";

/**
 * Answers that must take as long whether or not the address has an account. Better Auth writes a
 * reset token only for a known one, and gives `/send-verification-email` such a floor itself.
 */
export const MINIMUM_RESPONSE_MS: Readonly<Record<string, number>> = {
	[`${AUTH_BASE_PATH}/request-password-reset`]: 500,
};

@Injectable()
export class BetterAuthHttpHandler extends AuthHttpHandler {
	constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuth) {
		super();
	}

	async handle(request: Request): Promise<Response> {
		const floor = MINIMUM_RESPONSE_MS[new URL(request.url).pathname];
		if (floor === undefined) {
			return this.auth.handler(request);
		}
		const notBefore = Date.now() + floor;
		const response = await this.auth.handler(request);
		const remaining = notBefore - Date.now();
		if (remaining > 0) {
			await setTimeout(remaining);
		}
		return response;
	}
}
