import { randomUUID } from "node:crypto";
import { IntegrationEventEnvelope } from "@holdem/shared/events";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { EventBus, type IEvent } from "@nestjs/cqrs";
import {
	definitionOf,
	IntegrationEventBus,
	integrationEventNamed,
} from "../../application/integration-events.js";
import { afterCommit } from "../database/index.js";
import { InjectRedis, type Redis, RedisConnections } from "../redis/index.js";

/** The Redis pub/sub channel broadcast integration events travel on. */
export const INTEGRATION_EVENTS_CHANNEL = "integration-events";

/**
 * Integration events through `@nestjs/cqrs`'s `EventBus` on this instance, and through Redis
 * pub/sub to every other one for `broadcast` events, where they are checked against their schema
 * and published on that instance's `EventBus`. Pub/sub keeps nothing: an instance that is not
 * subscribed at that moment misses the event (at most once, see `IntegrationEventBus`).
 */
@Injectable()
export class RedisIntegrationEventBus
	extends IntegrationEventBus
	implements OnModuleInit
{
	private readonly logger = new Logger(IntegrationEventBus.name);
	/** Tells this instance's own broadcasts apart, which it has handled already. */
	private readonly instanceId = randomUUID();
	private readonly subscriber: Redis;
	private readonly listener = (message: string) => this.receive(message);
	private failing = false;

	constructor(
		private readonly eventBus: EventBus,
		@InjectRedis() private readonly redis: Redis,
		connections: RedisConnections,
	) {
		super();
		this.subscriber = connections.open("integration-events");
	}

	/**
	 * Subscribes before the app takes requests, when Redis answers in time; otherwise once it is
	 * ready. The client subscribes again by itself after a reconnect.
	 */
	async onModuleInit(): Promise<void> {
		this.subscriber.on("ready", () => void this.subscribe());
		await this.subscribe();
	}

	publish(...events: IEvent[]): void {
		const definitions = events.map((event) => {
			const definition = definitionOf(event);
			if (!definition) {
				throw new Error(
					`${event.constructor.name} is not an @IntegrationEvent`,
				);
			}
			return definition;
		});
		afterCommit(() => {
			for (const [index, event] of events.entries()) {
				this.eventBus.publish(event);
				const { name, version, broadcast } = definitions[index]!;
				if (broadcast) {
					this.broadcast({
						from: this.instanceId,
						name,
						v: version,
						data: { ...event },
					});
				}
			}
		});
	}

	private async subscribe(): Promise<void> {
		try {
			await this.subscriber.subscribe(
				INTEGRATION_EVENTS_CHANNEL,
				this.listener,
			);
			this.failing = false;
		} catch (error) {
			this.warnOnce(error);
		}
	}

	private broadcast(envelope: IntegrationEventEnvelope): void {
		this.redis
			.publish(INTEGRATION_EVENTS_CHANNEL, JSON.stringify(envelope))
			.then(() => {
				this.failing = false;
			})
			.catch((error: unknown) => this.warnOnce(error));
	}

	/** Another instance's broadcast: published here once it checks out against its schema. */
	private receive(message: string): void {
		let envelope: IntegrationEventEnvelope;
		try {
			envelope = IntegrationEventEnvelope.parse(JSON.parse(message));
		} catch {
			this.logger.warn("Dropped an integration event that is not one");
			return;
		}
		if (envelope.from === this.instanceId) {
			return;
		}
		const { name, v } = envelope;
		const type = integrationEventNamed(name);
		const definition = type && definitionOf(type.prototype as IEvent);
		const data = definition?.schema.safeParse(envelope.data);
		if (!type || definition?.version !== v || !data?.success) {
			// An instance on another version during a rolling deploy, most likely.
			this.logger.warn({ msg: "Dropped an integration event", name, v });
			return;
		}
		this.eventBus.publish(
			Object.assign(Object.create(type.prototype) as IEvent, data.data),
		);
	}

	private warnOnce(error: unknown): void {
		if (!this.failing) {
			this.failing = true;
			this.logger.warn(
				`Integration events stay on this instance until Redis answers: ${(error as Error).message}`,
			);
		}
	}
}
