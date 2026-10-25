import { Global, Module } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { Mailer } from "@/shared/application/mailer.js";
import { ViewerResolver } from "@/shared/application/viewer.js";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	type Database,
	DATABASE,
} from "@/shared/infrastructure/database/index.js";
import { AuthHttpHandler } from "./application/auth-http-handler.js";
import { GetMeHandler } from "./application/queries/get-me/get-me.handler.js";
import { BETTER_AUTH, createBetterAuth } from "./infrastructure/better-auth.js";
import { BetterAuthHttpHandler } from "./infrastructure/better-auth-http.handler.js";
import { BetterAuthViewerResolver } from "./infrastructure/better-auth-viewer.resolver.js";
import { EmailCooldown } from "./infrastructure/email-cooldown.js";
import { MeController } from "./presentation/me.controller.js";

/**
 * Global so that every module's `AuthGuard` finds the `ViewerResolver`. Its HTTP mount,
 * `AuthMiddleware`, is applied by AppModule: middleware of global modules runs first, and the mount
 * must run after the request logger and the same-origin check.
 */
@Global()
@Module({
	controllers: [MeController],
	providers: [
		{
			provide: BETTER_AUTH,
			inject: [AppConfig, DATABASE, Mailer, EventBus, EmailCooldown],
			useFactory: (
				config: AppConfig,
				db: Database,
				mailer: Mailer,
				eventBus: EventBus,
				cooldown: EmailCooldown,
			) => createBetterAuth({ config, db, mailer, eventBus, cooldown }),
		},
		EmailCooldown,
		{ provide: AuthHttpHandler, useClass: BetterAuthHttpHandler },
		{ provide: ViewerResolver, useClass: BetterAuthViewerResolver },
		GetMeHandler,
	],
	exports: [ViewerResolver, AuthHttpHandler],
})
export class IdentityModule {}
