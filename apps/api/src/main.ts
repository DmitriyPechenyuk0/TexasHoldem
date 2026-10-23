import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ConfigError, loadConfig } from "./config/index.js";

async function bootstrap() {
	const config = loadConfig();
	const app = await NestFactory.create(AppModule.forRoot(config));
	await app.listen(config.port);
}

try {
	await bootstrap();
} catch (error) {
	if (!(error instanceof ConfigError)) {
		throw error;
	}
	console.error(error.message);
	process.exitCode = 1;
}
