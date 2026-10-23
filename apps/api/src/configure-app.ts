import type { INestApplication } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { SocketIoAdapter } from "@/shared/infrastructure/realtime/socket-io.adapter.js";

/** Settings that belong to the application rather than to a module. main.ts and the e2e tests share them. */
export function configureApp(app: INestApplication, config: AppConfig): void {
	app.useLogger(app.get(Logger));
	// The web app calls the api from its own origin, with the session cookie.
	app.enableCors({ origin: config.webOrigin, credentials: true });
	app.useWebSocketAdapter(new SocketIoAdapter(app, config));
}
