/** A link the recipient follows, and how long it works. */
export interface EmailLink {
	readonly url: string;
	readonly expiresInMinutes: number;
}

/**
 * Whom an email greets: the account's username, or null before it has one. Never a name from an
 * OAuth provider, which anyone can set to any text.
 */
export interface EmailGreeting {
	readonly username: string | null;
}

/** Every email the api sends: a template and the values it fills in. */
export type EmailContent =
	| {
			readonly template: "verify-email";
			readonly params: EmailLink & EmailGreeting;
	  }
	| {
			readonly template: "reset-password";
			readonly params: EmailLink & EmailGreeting;
	  }
	| {
			/** After the password changed or was reset; `url` leads to the account's settings. */
			readonly template: "password-changed";
			readonly params: EmailGreeting & { readonly url: string };
	  }
	| {
			/** After a provider was linked to the account; `url` leads to the account's settings. */
			readonly template: "sign-in-method-added";
			readonly params: EmailGreeting & {
				readonly provider: string;
				readonly url: string;
			};
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
