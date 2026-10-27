import {
	type DynamicModule,
	type MiddlewareConsumer,
	Module,
	type NestModule,
	RequestMethod,
} from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { IdentityModule } from "@/modules/identity/identity.module.js";
import { AuthMiddleware } from "@/modules/identity/presentation/auth.middleware.js";
import { ProfileModule } from "@/modules/profile/profile.module.js";
import { SystemModule } from "@/modules/system/system.module.js";
import {
	AppConfig,
	ConfigModule,
} from "@/shared/infrastructure/config/index.js";
import { DatabaseModule } from "@/shared/infrastructure/database/index.js";
import { LoggingModule } from "@/shared/infrastructure/logging/index.js";
import { MailModule } from "@/shared/infrastructure/mail/index.js";
import { StorageModule } from "@/shared/infrastructure/storage/index.js";
import { RedisModule } from "@/shared/infrastructure/redis/index.js";
import { sameOriginOnly } from "@/shared/presentation/same-origin.middleware.js";
import { SharedModule } from "@/shared/shared.module.js";

/** Composition root: the only module that knows every other one. */
@Module({})
export class AppModule implements NestModule {
	constructor(private readonly config: AppConfig) {}

	// Middleware of global modules runs first (the request logger), then this module's, in the order
	// listed: every request is logged, and checked for its origin before anything serves it.
	configure(consumer: MiddlewareConsumer): void {
		consumer
			.apply(sameOriginOnly(this.config.webOrigin))
			.forRoutes({ path: "{*path}", method: RequestMethod.ALL })
			.apply(AuthMiddleware)
			.forRoutes({ path: "auth/*path", method: RequestMethod.ALL });
	}

	static forRoot(config: AppConfig): DynamicModule {
		return {
			module: AppModule,
			imports: [
				ConfigModule.forRoot(config),
				LoggingModule,
				CqrsModule.forRoot(),
				DatabaseModule,
				RedisModule,
				MailModule,
				StorageModule,
				SharedModule,
				IdentityModule,
				ProfileModule,
				SystemModule,
			],
		};
	}
}
