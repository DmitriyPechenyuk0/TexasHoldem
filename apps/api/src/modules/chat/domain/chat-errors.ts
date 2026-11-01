import { DomainError } from "@/shared/domain/domain-error.js";

export class InvalidMessageLengthError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "chat.invalid-length";

	constructor(min: number, max: number) {
		super(`A message has ${min} to ${max} characters`, {
			params: { min, max },
		});
	}
}
