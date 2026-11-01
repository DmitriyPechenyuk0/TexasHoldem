import type { IncomingMessage } from "node:http";
import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { type Namespace, Server, type ServerOptions } from "socket.io";
import type {
	RateLimiter,
	RateLimitRule,
} from "../../application/rate-limiter.js";
import type { AppConfig } from "../config/index.js";
import { REDIS_COMMAND_TIMEOUT_MS, type Redis } from "../redis/index.js";

/** The largest message a client may send. Game commands are a few hundred bytes. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * Open connections per client address on one instance: a tab holds one, whatever namespaces it
 * joins, so this leaves room for a household behind one router.
 */
export const MAX_CONNECTIONS_PER_ADDRESS = 20;

/** New connections per client address, across instances: each one looks its session up. */
export const HANDSHAKE_RULE: RateLimitRule = { max: 60, windowSeconds: 60 };

/**
 * How long the adapter's read of the Redis stream blocks, waiting for other instances' messages.
 * It must end well within `REDIS_COMMAND_TIMEOUT_MS`, which its client inherits: a read the
 * client gave up on would hold up the commands behind it.
 */
export const ADAPTER_READ_BLOCK_MS = REDIS_COMMAND_TIMEOUT_MS / 2;

/** The adapter's commands on its publishing client, which fail at once while Redis is not ready. */
const PUBLISHING_COMMANDS: ReadonlySet<PropertyKey> = new Set([
	"xAdd",
	"publish",
	"sPublish",
	"set",
	"get",
	"xRange",
]);

/**
 * The streams adapter publishes each broadcast before it emits to this instance's sockets. While
 * Redis is down, a queued command would hold every broadcast up for the command timeout; failing
 * at once lets this instance's sockets get it straight away, and only other instances miss it.
 * Its reading connections, from `duplicate()`, are untouched: they wait for Redis to come back.
 */
export function failingFastWhileDown(redis: Redis): Redis {
	return new Proxy(redis, {
		get(target, property) {
			const value: unknown = Reflect.get(target, property, target);
			if (typeof value !== "function") {
				return value;
			}
			const method = (value as (...args: unknown[]) => unknown).bind(target);
			if (!PUBLISHING_COMMANDS.has(property)) {
				return method;
			}
			return (...args: unknown[]) =>
				target.isReady
					? method(...args)
					: Promise.reject(new Error("Redis is not ready"));
		},
	});
}

/** Runs when a client joins a namespace, before any gateway sees the socket. */
export type ConnectionMiddleware = Parameters<Namespace["use"]>[0];

export interface SocketIoAdapterOptions {
	readonly config: AppConfig;
	readonly limiter: RateLimiter;
	/** The client's address as Express sees it, so TRUST_PROXY applies to sockets too. */
	readonly clientAddressOf: (request: IncomingMessage) => string;
	readonly connectionMiddleware?: readonly ConnectionMiddleware[];
	/**
	 * A connection of its own for the Redis streams adapter, through which rooms reach the sockets
	 * of every instance (POK-78). The adapter opens two more from it, to read the stream and for
	 * pub/sub, and closes them when the server closes.
	 */
	readonly redis: Redis;
}

/**
 * socket.io on the api's HTTP server, accepting WebSocket connections from the web app's origin
 * with cookies, a bounded number per client address. `connectionMiddleware` runs on every
 * namespace a gateway serves, such as the session check from the presentation layer that the
 * composition root passes in.
 *
 * Every namespace goes through the Redis streams adapter, so a room reaches its sockets on every
 * instance. WebSocket is the only transport: a connection then stays on the instance it reached,
 * so instances need no sticky sessions behind a load balancer, as long-polling would.
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
		const { config, limiter, clientAddressOf, redis } = this.options;
		const { webOrigin } = config;
		const withCors: Partial<ServerOptions> = {
			...options,
			cors: { origin: webOrigin, credentials: true },
			transports: ["websocket"],
			adapter: createAdapter(failingFastWhileDown(redis), {
				blockTimeInMs: ADAPTER_READ_BLOCK_MS,
			}) as ServerOptions["adapter"],
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
