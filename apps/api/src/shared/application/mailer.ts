/** A link the recipient follows, and how long it works. */
export interface EmailLink {
	readonly url: string;
	readonly expiresInMinutes: number;
}

/** Every email the api sends: a template and the values it fills in. */
export type EmailContent =
	| {
			readonly template: "verify-email";
			readonly params: EmailLink & { readonly username: string };
	  }
	| {
			readonly template: "reset-password";
			readonly params: EmailLink & { readonly username: string };
	  };

export type EmailTemplate = EmailContent["template"];

export type Email = EmailContent & {
	readonly to: string;
	/** The recipient's locale, such as `ru` or `ru-RU`. Unknown or missing locales get English. */
	readonly locale?: string;
};

/**
 * Port for outgoing email. `send` renders the email and returns at once: delivery, with retries,
 * happens in the background, so a slow or failing mail server never fails the caller. Delivery
 * failures are logged, never thrown.
 */
export abstract class Mailer {
	abstract send(email: Email): void;
}
