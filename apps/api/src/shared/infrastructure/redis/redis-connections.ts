import { AsyncResource } from "node:async_hooks";
import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { createClient } from "@redis/client";
import { AppConfig } from "../config/index.js";
import type { Redis } from "./redis.js";

/**
 * How long a command may take, waiting in the offline queue included. Redis answers in well under
 * a millisecond, so a command still pending after this is failed instead of hanging its caller.
 */
export const REDIS_COMMAND_TIMEOUT_MS = 2_000;

/** Commands waiting while Redis is unreachable; beyond this, new ones fail at once instead of piling up. */
const MAX_QUEUED_COMMANDS = 10_000;

/**
 * Opens and owns every Redis connection. Pub/sub subscribers and blocking commands need a
 * connection of their own; everything else shares the one behind `@InjectRedis()`.
 */
@Injectable()
export class RedisConnections implements OnApplicationShutdown {
	private readonly logger = new Logger("Redis");
	private readonly clients = new Set<Redis>();

	constructor(private readonly config: AppConfig) {}

	/**
	 * Connects in the background: a Redis outage must not block startup, and commands wait in the
	 * offline queue until the client is ready, up to `REDIS_COMMAND_TIMEOUT_MS`. The client
	 * reconnects on its own. A connection for blocking commands will need a longer timeout.
	 */
	open(purpose: string): Redis {
		const name = `holdem-api:${purpose}`;
		const client: Redis = createClient({
			url: this.config.redis.url,
			name,
			commandsQueueMaxLength: MAX_QUEUED_COMMANDS,
			commandOptions: { timeout: REDIS_COMMAND_TIMEOUT_MS },
		});

		// Without an `error` listener, a lost connection crashes the process. Warn once per outage.
		// Listeners are bound to this context, so the lines never carry the requestId of whichever
		// request was running when the socket event fired.
		let reportedOutage = false;
		client.on(
			"error",
			AsyncResource.bind((error: Error) => {
				if (!reportedOutage) {
					reportedOutage = true;
					this.logger.warn(`${name} is unavailable: ${error.message}`);
				}
			}),
		);
		client.on(
			"ready",
			AsyncResource.bind(() => {
				if (reportedOutage) {
					reportedOutage = false;
					this.logger.log(`${name} reconnected`);
				}
			}),
		);

		this.clients.add(client);
		// Failures are reported through `error` and retried by the reconnect strategy.
		client.connect().catch(() => undefined);
		return client;
	}

	/** Lets ready clients finish pending commands; drops the rest, whose queue would never drain. */
	async onApplicationShutdown(): Promise<void> {
		await Promise.all(
			[...this.clients].map(async (client) => {
				if (client.isReady) {
					await client.close();
				} else if (client.isOpen) {
					client.destroy();
				}
			}),
		);
		this.clients.clear();
	}
}
