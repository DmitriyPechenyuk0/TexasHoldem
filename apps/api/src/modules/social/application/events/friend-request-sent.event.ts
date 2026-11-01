import { FriendRequestSentV1 } from "@holdem/shared/events";
import type { IEvent } from "@nestjs/cqrs";
import { IntegrationEvent } from "@/shared/application/integration-events.js";

/**
 * Integration event: a player asked another to be friends. Published once; whoever notifies the
 * one asked reaches their sockets through the adapter, on any instance.
 */
@IntegrationEvent({
	name: "social.friend-request-sent",
	version: 1,
	schema: FriendRequestSentV1,
	broadcast: false,
})
export class FriendRequestSent implements IEvent {
	constructor(
		readonly fromId: string,
		readonly toId: string,
	) {}
}
