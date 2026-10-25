import { DomainError } from "@/shared/domain/domain-error.js";

export class UserNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "identity.user-not-found";

	constructor() {
		super("The account does not exist.");
	}
}
