import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { SystemModule } from "@/modules/system/system.module.js";
import {
	type AppConfig,
	ConfigModule,
} from "@/shared/infrastructure/config/index.js";
import { SharedModule } from "@/shared/shared.module.js";

/** Composition root: the only module that knows every other one. */
@Module({})
export class AppModule {
	static forRoot(config: AppConfig): DynamicModule {
		return {
			module: AppModule,
			imports: [
				ConfigModule.forRoot(config),
				CqrsModule.forRoot(),
				SharedModule,
				SystemModule,
			],
		};
	}
}
