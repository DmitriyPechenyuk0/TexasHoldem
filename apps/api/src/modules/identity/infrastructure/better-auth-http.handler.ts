import { Inject, Injectable } from "@nestjs/common";
import { AuthHttpHandler } from "../application/auth-http-handler.js";
import { BETTER_AUTH, type BetterAuth } from "./better-auth.js";

@Injectable()
export class BetterAuthHttpHandler extends AuthHttpHandler {
	constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuth) {
		super();
	}

	handle(request: Request): Promise<Response> {
		return this.auth.handler(request);
	}
}
