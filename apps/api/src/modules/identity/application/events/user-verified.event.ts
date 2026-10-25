import type { UserId } from "@holdem/shared";
import type { IEvent } from "@nestjs/cqrs";

/**
 * Integration event: the user's email is verified, through the emailed link or because an OAuth
 * provider vouched for it at sign-up. Only verified users may take a seat.
 */
export class UserVerified implements IEvent {
	constructor(readonly userId: UserId) {}
}
