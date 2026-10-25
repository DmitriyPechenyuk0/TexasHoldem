import { DomainError } from "@/shared/domain/domain-error.js";

export class UsernameTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "identity.username-taken";

	constructor() {
		super("The username is taken.");
	}
}
