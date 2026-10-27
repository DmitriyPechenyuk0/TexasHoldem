import type { IncomingMessage } from "node:http";
import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { type Namespace, Server, type ServerOptions } from "socket.io";
import type {
	RateLimiter,
	RateLimitRule,
} from "../../application/rate-limiter.js";
import type { AppConfig } from "../config/index.js";

/** The largest message a client may send. Game commands are a few hundred bytes. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * Open connections per client address on one instance: a tab holds one, whatever namespaces it
 * joins, so this leaves room for a household behind one router.
 */
export const MAX_CONNECTIONS_PER_ADDRESS = 20;

/** New connections per client address, across instances: each one looks its session up. */
export const HANDSHAKE_RULE: RateLimitRule = { max: 60, windowSeconds: 60 };

/** Runs when a client joins a namespace, before any gateway sees the socket. */
export type ConnectionMiddleware = Parameters<Namespace["use"]>[0];

export interface SocketIoAdapterOptions {
	readonly config: AppConfig;
	readonly limiter: RateLimiter;
	/** The client's address as Express sees it, so TRUST_PROXY applies to sockets too. */
	readonly clientAddressOf: (request: IncomingMessage) => string;
	readonly connectionMiddleware?: readonly ConnectionMiddleware[];
}

/**
 * socket.io on the api's HTTP server, accepting connections from the web app's origin with
 * cookies, a bounded number per client address. `connectionMiddleware` runs on every namespace a
 * gateway serves, such as the session check from the presentation layer that the composition root
 * passes in.
 */
export class SocketIoAdapter extends IoAdapter {
	private readonly prepared = new WeakSet<Namespace>();
	/** Open connections per client address on this instance. */
	private readonly open = new Map<string, number>();

	constructor(
		app: INestApplicationContext,
		private readonly options: SocketIoAdapterOptions,
	) {
		super(app);
	}

	// Nest calls this once per gateway; gateways may share a namespace.
	override create(
		port: number,
		options?: ServerOptions & { namespace?: string },
	) {
		const target = super.create(port, options) as Server | Namespace;
		const namespace = target instanceof Server ? target.sockets : target;
		if (!this.prepared.has(namespace)) {
			this.prepared.add(namespace);
			for (const middleware of this.options.connectionMiddleware ?? []) {
				namespace.use(middleware);
			}
		}
		return target;
	}

	override createIOServer(port: number, options?: ServerOptions): Server {
		const { config, limiter, clientAddressOf } = this.options;
		const { webOrigin } = config;
		const withCors: Partial<ServerOptions> = {
			...options,
			cors: { origin: webOrigin, credentials: true },
			// Runs once per connection, on its handshake.
			allowRequest: (request, callback) => {
				// CORS only tells a browser which responses a page may read: it does not stop a page
				// on another origin from opening a socket that carries the visitor's cookies
				// (cross-site WebSocket hijacking). Browsers always send Origin, so a foreign one is
				// refused. A client without one is not a browser and has no visitor's cookies to borrow.
				const { origin } = request.headers;
				if (origin !== undefined && origin !== webOrigin) {
					callback(null, false);
					return;
				}
				const address = clientAddressOf(request);
				if ((this.open.get(address) ?? 0) >= MAX_CONNECTIONS_PER_ADDRESS) {
					callback(null, false);
					return;
				}
				limiter.consume(`realtime:handshake:${address}`, HANDSHAKE_RULE).then(
					(decision) => callback(null, decision.allowed),
					() => callback(null, true),
				);
			},
			maxHttpBufferSize: MAX_MESSAGE_BYTES,
		};
		// socket.io takes partial options (`new Server(server, Partial<ServerOptions>)`), and so does
		// IoAdapter at runtime; only its declared parameter type lists every field as required.
		const server = super.createIOServer(port, withCors as ServerOptions);
		server.engine.on(
			"connection",
			(connection: {
				request: IncomingMessage;
				once(event: "close", listener: () => void): void;
			}) => {
				const address = clientAddressOf(connection.request);
				this.open.set(address, (this.open.get(address) ?? 0) + 1);
				connection.once("close", () => {
					const left = (this.open.get(address) ?? 1) - 1;
					if (left > 0) {
						this.open.set(address, left);
					} else {
						this.open.delete(address);
					}
				});
			},
		);
		return server;
	}
}
