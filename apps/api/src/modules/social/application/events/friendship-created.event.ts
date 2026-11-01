import { FriendshipCreatedV1 } from "@holdem/shared/events";
import type { IEvent } from "@nestjs/cqrs";
import { IntegrationEvent } from "@/shared/application/integration-events.js";

/** Integration event: two players are friends now, one having asked and the other accepted. */
@IntegrationEvent({
	name: "social.friendship-created",
	version: 1,
	schema: FriendshipCreatedV1,
	broadcast: false,
})
export class FriendshipCreated implements IEvent {
	constructor(
		readonly requesterId: string,
		readonly accepterId: string,
	) {}
}
