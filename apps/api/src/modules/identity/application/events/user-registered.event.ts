import type { Locale, UserId } from "@holdem/shared";
import type { IEvent } from "@nestjs/cqrs";

/** Integration event: an account was created; its email is not verified yet. */
export class UserRegistered implements IEvent {
	constructor(
		readonly userId: UserId,
		readonly username: string,
		readonly locale: Locale,
	) {}
}
