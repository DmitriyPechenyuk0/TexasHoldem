import { type DynamicModule, Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { type AppConfig, ConfigModule } from "./config/index.js";

@Module({
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {
	static forRoot(config: AppConfig): DynamicModule {
		return {
			module: AppModule,
			imports: [ConfigModule.forRoot(config)],
		};
	}
}
