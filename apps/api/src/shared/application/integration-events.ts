import type { IEvent } from "@nestjs/cqrs";
import type { z } from "zod";

/** What an integration event class says about itself, through `@IntegrationEvent`. */
export interface IntegrationEventDefinition {
	/** `<context>.<event>`, e.g. `identity.user-registered`: what other instances know it by. */
	readonly name: string;
	readonly version: number;
	/** The schema of its data at this version, from `@holdem/shared/events`. */
	readonly schema: z.ZodType;
	/**
	 * Handled on every instance, not only the one that published it: for subscribers that keep
	 * something per instance, such as a read model in memory or the sockets they serve.
	 */
	readonly broadcast: boolean;
}

/** An integration event class: plain data in its own properties, which its schema describes. */
export type IntegrationEventType = abstract new (...args: never[]) => IEvent;

const definitions = new Map<IntegrationEventType, IntegrationEventDefinition>();
const typesByName = new Map<string, IntegrationEventType>();

/**
 * Marks a class as an integration event between contexts (Context Map). Its subscribers are
 * `@EventsHandler`s, which `IntegrationEventBus` reaches on this instance, and on every other one
 * when the event is `broadcast`.
 */
export function IntegrationEvent(
	definition: IntegrationEventDefinition,
): (type: IntegrationEventType) => void {
	return (type) => {
		const named = typesByName.get(definition.name);
		if (named && named !== type) {
			throw new Error(`Two integration events are named ${definition.name}`);
		}
		definitions.set(type, definition);
		typesByName.set(definition.name, type);
	};
}

/** The definition of the event's class; undefined for an event that is not an integration event. */
export const definitionOf = (
	event: IEvent,
): IntegrationEventDefinition | undefined =>
	definitions.get(event.constructor as IntegrationEventType);

/** The integration event class with this name, if this instance knows one. */
export const integrationEventNamed = (
	name: string,
): IntegrationEventType | undefined => typesByName.get(name);

/**
 * Port for publishing integration events. Within a transaction (`inTransaction`), they go out once
 * it has committed, and a rollback drops them; elsewhere, at once. Write first, then publish: an
 * event never tells of a change that did not happen.
 *
 * Delivery is at most once: an instance that stops after the commit but before publishing, or
 * that misses a broadcast while Redis is unreachable, loses the event. A transactional outbox
 * (POK-130) would make it at least once.
 */
export abstract class IntegrationEventBus {
	abstract publish(...events: IEvent[]): void;
}
