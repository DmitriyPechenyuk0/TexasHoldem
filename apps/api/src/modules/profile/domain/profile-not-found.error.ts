import { DomainError } from "@/shared/domain/domain-error.js";

export class ProfileNotFoundError extends DomainError {
	readonly kind = "not-found";
	readonly code = "profile.not-found";

	constructor() {
		super("No such profile");
	}
}
