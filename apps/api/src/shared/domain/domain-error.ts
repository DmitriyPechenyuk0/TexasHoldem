/** What kind of rule was broken, in domain terms. Presentation maps each kind to a transport status. */
export type DomainErrorKind =
	"not-found" | "conflict" | "rule-violation" | "forbidden";

export type DomainErrorParams = Readonly<Record<string, string | number>>;

export interface DomainErrorOptions extends ErrorOptions {
	/** Values the client interpolates into the message it shows for `code`, e.g. `{ seat: 3 }`. */
	readonly params?: DomainErrorParams;
}

/**
 * An expected business failure. Each subclass names one concrete case and carries a stable
 * `code` (`<context>.<case>`, e.g. `table.seat-taken`): clients switch on it and use it as the
 * message key to translate. The message is an English fallback for logs and developers.
 */
export abstract class DomainError extends Error {
	abstract readonly kind: DomainErrorKind;
	abstract readonly code: string;
	readonly params?: DomainErrorParams;

	constructor(message: string, options?: DomainErrorOptions) {
		super(message, options);
		this.name = new.target.name;
		this.params = options?.params;
	}
}
