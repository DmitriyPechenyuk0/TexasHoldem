import { API_PREFIX, PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import { type INestApplication, NotFoundException } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Express } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import proxyAddr from "proxy-addr";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { RateLimiter } from "@/shared/application/rate-limiter.js";
import { SocketIoAdapter } from "@/shared/infrastructure/realtime/socket-io.adapter.js";
import { ViewerResolver } from "@/shared/application/viewer.js";
import { authenticateSockets } from "@/shared/presentation/realtime/socket-session.js";
import { problemFor } from "@/shared/presentation/problem.js";

/** Larger JSON bodies are refused with 413. */
export const JSON_BODY_LIMIT = "16kb";

/** Settings that belong to the application rather than to a module. main.ts and the e2e tests share them. */
export function configureApp(app: INestApplication, config: AppConfig): void {
	app.useLogger(app.get(Logger));
	// Every REST route lives under /api, so web and api can share one origin behind a reverse proxy.
	app.setGlobalPrefix(API_PREFIX);
	// Behind a load balancer the client address comes from X-Forwarded-For, for the proxies trusted here.
	const express = app.getHttpAdapter().getInstance() as Express;
	express.set("trust proxy", config.trustProxy);
	// Security headers. The api only answers JSON, so the strict default CSP costs nothing; the web
	// app is another origin of the same site, so resources are shared same-site.
	app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
	// In development the web app calls the api from its own origin, with the session cookie; in
	// production both share one origin behind the reverse proxy and CORS is unused.
	app.enableCors({ origin: config.webOrigin, credentials: true });
	// Nest answers unknown routes and errors only under the global prefix. Everything else would get
	// Express's HTML pages, with a stack trace unless NODE_ENV is production, so it is refused here.
	express.use((request, response, next) => {
		if (
			request.path === API_PREFIX ||
			request.path.startsWith(`${API_PREFIX}/`)
		) {
			next();
			return;
		}
		const { problem } = problemFor(
			new NotFoundException(`Cannot ${request.method} ${request.path}`),
			{ instance: request.path },
		);
		response
			.status(404)
			.type(PROBLEM_CONTENT_TYPE)
			.send(JSON.stringify(problem));
	});
	// The api only takes small JSON bodies. Registered before Nest's own parsers, so this one wins.
	(app as NestExpressApplication).useBodyParser("json", {
		limit: JSON_BODY_LIMIT,
	});
	// Sockets bypass Express, so their client address follows the same `trust proxy` by hand.
	const trust = express.get("trust proxy fn") as Parameters<
		typeof proxyAddr
	>[1];
	app.useWebSocketAdapter(
		new SocketIoAdapter(app, {
			config,
			limiter: app.get(RateLimiter),
			clientAddressOf: (request) => proxyAddr(request, trust),
			connectionMiddleware: [authenticateSockets(app.get(ViewerResolver))],
		}),
	);
}
