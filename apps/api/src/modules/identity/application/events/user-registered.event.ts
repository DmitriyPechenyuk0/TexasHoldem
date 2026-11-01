import type { Locale, UserId } from "@holdem/shared";
import { UserRegisteredV1 } from "@holdem/shared/events";
import type { IEvent } from "@nestjs/cqrs";
import { IntegrationEvent } from "@/shared/application/integration-events.js";

/** Integration event: an account was created; its email is not verified yet. */
@IntegrationEvent({
	name: "identity.user-registered",
	version: 1,
	schema: UserRegisteredV1,
	broadcast: false,
})
export class UserRegistered implements IEvent {
	constructor(
		readonly userId: UserId,
		readonly username: string,
		readonly locale: Locale,
	) {}
}
