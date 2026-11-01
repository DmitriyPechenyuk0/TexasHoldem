import type { UserId } from "@holdem/shared";
import { UserVerifiedV1 } from "@holdem/shared/events";
import type { IEvent } from "@nestjs/cqrs";
import { IntegrationEvent } from "@/shared/application/integration-events.js";

/**
 * Integration event: the user's email is verified, through the emailed link or because an OAuth
 * provider vouched for it at sign-up. Only verified users may take a seat.
 */
@IntegrationEvent({
	name: "identity.user-verified",
	version: 1,
	schema: UserVerifiedV1,
	broadcast: false,
})
export class UserVerified implements IEvent {
	constructor(readonly userId: UserId) {}
}
