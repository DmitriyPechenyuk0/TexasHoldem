import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { SystemModule } from "@/modules/system/system.module.js";
import {
	type AppConfig,
	ConfigModule,
} from "@/shared/infrastructure/config/index.js";
import { DatabaseModule } from "@/shared/infrastructure/database/index.js";
import { LoggingModule } from "@/shared/infrastructure/logging/index.js";
import { MailModule } from "@/shared/infrastructure/mail/index.js";
import { RedisModule } from "@/shared/infrastructure/redis/index.js";
import { SharedModule } from "@/shared/shared.module.js";

/** Composition root: the only module that knows every other one. */
@Module({})
export class AppModule {
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
				SharedModule,
				SystemModule,
			],
		};
	}
}
