import { DomainError } from "@/shared/domain/domain-error.js";

/** A username is chosen once; renaming is not offered (Profile's nickname is the display name). */
export class UsernameAlreadyChosenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "identity.username-already-chosen";

	constructor() {
		super("The account already has a username.");
	}
}
