import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import {
	ConfigError,
	loadConfig,
} from "@/shared/infrastructure/config/index.js";

// Upper bound for a graceful shutdown; whatever is still open after that is cut off.
const SHUTDOWN_TIMEOUT_MS = 10_000;
const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"];

async function bootstrap() {
	const config = loadConfig();
	const app = await NestFactory.create(AppModule.forRoot(config));

	// On these signals Nest stops accepting requests, runs the shutdown hooks
	// (database pool, Redis connections) and then exits.
	app.enableShutdownHooks(SHUTDOWN_SIGNALS);
	for (const signal of SHUTDOWN_SIGNALS) {
		process.once(signal, () => {
			setTimeout(() => {
				console.error(
					`Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS} ms; exiting.`,
				);
				process.exit(1);
			}, SHUTDOWN_TIMEOUT_MS).unref();
		});
	}

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
