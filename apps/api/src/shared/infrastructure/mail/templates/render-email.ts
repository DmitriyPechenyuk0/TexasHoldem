import { LOCALES, type Locale } from "@holdem/shared/contracts/common";
import type { EmailContent } from "../../../application/mailer.js";
import type { EmailCopy } from "./email-copy.js";
import { type RenderedEmail, renderLayout } from "./layout.js";
import { passwordChanged } from "./password-changed.js";
import { resetPassword } from "./reset-password.js";
import { signInMethodAdded } from "./sign-in-method-added.js";
import { verifyEmail } from "./verify-email.js";

/** `ru`, `ru-RU` and `RU` → `ru`; anything unsupported or missing → `en`. */
export function resolveLocale(locale: string | undefined): Locale {
	const language = locale?.split(/[-_]/)[0]?.toLowerCase();
	return LOCALES.find((supported) => supported === language) ?? "en";
}

function copyOf(content: EmailContent, locale: Locale): EmailCopy {
	switch (content.template) {
		case "verify-email":
			return verifyEmail[locale](content.params);
		case "reset-password":
			return resetPassword[locale](content.params);
		case "password-changed":
			return passwordChanged[locale](content.params);
		case "sign-in-method-added":
			return signInMethodAdded[locale](content.params);
	}
}

export function renderEmail(
	content: EmailContent,
	locale: string | undefined,
): RenderedEmail {
	const resolved = resolveLocale(locale);
	return renderLayout(copyOf(content, resolved), resolved);
}
