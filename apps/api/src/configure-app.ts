import type { INestApplication } from "@nestjs/common";
import type { Express } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { SocketIoAdapter } from "@/shared/infrastructure/realtime/socket-io.adapter.js";

/** Settings that belong to the application rather than to a module. main.ts and the e2e tests share them. */
export function configureApp(app: INestApplication, config: AppConfig): void {
	app.useLogger(app.get(Logger));
	// Behind a load balancer the client address comes from X-Forwarded-For, for the proxies trusted here.
	const express = app.getHttpAdapter().getInstance() as Express;
	express.set("trust proxy", config.trustProxy);
	// Security headers. The api only answers JSON, so the strict default CSP costs nothing; the web
	// app is another origin of the same site, so resources are shared same-site.
	app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
	// The web app calls the api from its own origin, with the session cookie.
	app.enableCors({ origin: config.webOrigin, credentials: true });
	app.useWebSocketAdapter(new SocketIoAdapter(app, config));
}
