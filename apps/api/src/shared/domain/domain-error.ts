/** What kind of rule was broken, in domain terms. Presentation maps each kind to a transport status. */
export type DomainErrorKind =
	"not-found" | "conflict" | "rule-violation" | "forbidden";

/**
 * An expected business failure. Each subclass names one concrete case and carries
 * a stable `code` (`<context>.<case>`, e.g. `table.seat-taken`) that clients can rely on.
 */
export abstract class DomainError extends Error {
	abstract readonly kind: DomainErrorKind;
	abstract readonly code: string;

	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name;
	}
}
