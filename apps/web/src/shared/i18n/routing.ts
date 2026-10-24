import { defineRouting } from "next-intl/routing";

/**
 * Every URL carries its locale (`/en/...`, `/ru/...`): pages render statically per locale, and a
 * shared link opens in the language it was sent in. `/` redirects by the NEXT_LOCALE cookie, then by
 * Accept-Language, then to English.
 */
export const routing = defineRouting({
	locales: ["en", "ru"],
	defaultLocale: "en",
	localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
