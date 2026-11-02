import type { IEvent } from "@nestjs/cqrs";

/**
 * In-process: the player came online, went offline, or sat down or left a table while online. The
 * `/social` gateway tells their online friends, through the adapter.
 */
export class PresenceChanged implements IEvent {
	constructor(readonly userId: string) {}
}
