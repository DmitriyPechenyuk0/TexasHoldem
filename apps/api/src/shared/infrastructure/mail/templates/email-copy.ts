import type { Locale } from "@holdem/shared/contracts/common";

/** What an email says, as plain text. The layout turns it into the HTML and text versions. */
export interface EmailCopy {
	readonly subject: string;
	/** The line inbox lists show next to the subject; hidden in the email itself. */
	readonly preview: string;
	readonly heading: string;
	/** Before the button. */
	readonly paragraphs: readonly string[];
	readonly action: { readonly label: string; readonly url: string };
	/** After the button, in smaller print: how long the link works, what to do if it was not you. */
	readonly notes: readonly string[];
}

/** A template: its copy in every locale, so a missing translation fails to compile. */
export type LocalizedCopy<Params> = Readonly<
	Record<Locale, (params: Params) => EmailCopy>
>;

/** The first line of an email: by username, or without a name before the account has one. */
export function greeting(username: string | null, locale: Locale): string {
	if (locale === "ru") {
		return username ? `Здравствуйте, ${username}!` : "Здравствуйте!";
	}
	return username ? `Hi ${username},` : "Hi,";
}

/** `90` → "90 minutes", `1440` → "24 hours" ("24 часа"), with the locale's plural forms. */
export function formatDuration(minutes: number, locale: Locale): string {
	const [value, unit] =
		minutes % 60 === 0 ? [minutes / 60, "hour"] : [minutes, "minute"];
	return new Intl.NumberFormat(locale, {
		style: "unit",
		unit,
		unitDisplay: "long",
	}).format(value);
}
