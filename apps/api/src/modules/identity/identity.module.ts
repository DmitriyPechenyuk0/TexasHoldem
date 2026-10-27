import { Global, Module } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { Mailer } from "@/shared/application/mailer.js";
import { RateLimiter } from "@/shared/application/rate-limiter.js";
import { ViewerResolver } from "@/shared/application/viewer.js";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	type Database,
	DATABASE,
} from "@/shared/infrastructure/database/index.js";
import { AuthHttpHandler } from "./application/auth-http-handler.js";
import { ChooseUsernameHandler } from "./application/commands/choose-username/choose-username.handler.js";
import { SetEmailLocaleHandler } from "./application/commands/set-email-locale/set-email-locale.handler.js";
import { OAuthProviders } from "./application/oauth-providers.js";
import { PasswordBreaches } from "./application/password-breaches.js";
import { GetMeHandler } from "./application/queries/get-me/get-me.handler.js";
import { GetOAuthProvidersHandler } from "./application/queries/get-oauth-providers/get-oauth-providers.handler.js";
import { UserRepository } from "./application/user.repository.js";
import { BETTER_AUTH, createBetterAuth } from "./infrastructure/better-auth.js";
import { BetterAuthHttpHandler } from "./infrastructure/better-auth-http.handler.js";
import { BetterAuthViewerResolver } from "./infrastructure/better-auth-viewer.resolver.js";
import { ConfiguredOAuthProviders } from "./infrastructure/configured-oauth-providers.js";
import { EmailThrottle } from "./infrastructure/email-throttle.js";
import { DrizzleUserRepository } from "./infrastructure/persistence/drizzle-user.repository.js";
import { PwnedPasswords } from "./infrastructure/pwned-passwords.js";
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
			inject: [
				AppConfig,
				DATABASE,
				Mailer,
				EventBus,
				EmailThrottle,
				RateLimiter,
				PasswordBreaches,
			],
			useFactory: (
				config: AppConfig,
				db: Database,
				mailer: Mailer,
				eventBus: EventBus,
				emailThrottle: EmailThrottle,
				rateLimiter: RateLimiter,
				passwordBreaches: PasswordBreaches,
			) =>
				createBetterAuth({
					config,
					db,
					mailer,
					eventBus,
					emailThrottle,
					rateLimiter,
					passwordBreaches,
				}),
		},
		EmailThrottle,
		{ provide: AuthHttpHandler, useClass: BetterAuthHttpHandler },
		{ provide: ViewerResolver, useClass: BetterAuthViewerResolver },
		{ provide: UserRepository, useClass: DrizzleUserRepository },
		{ provide: OAuthProviders, useClass: ConfiguredOAuthProviders },
		{ provide: PasswordBreaches, useClass: PwnedPasswords },
		GetMeHandler,
		GetOAuthProvidersHandler,
		SetEmailLocaleHandler,
		ChooseUsernameHandler,
	],
	exports: [ViewerResolver, AuthHttpHandler],
})
export class IdentityModule {}
