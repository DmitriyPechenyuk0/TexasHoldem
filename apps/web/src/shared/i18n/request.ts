import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as localeParam } from "next/root-params";
import { notFound } from "next/navigation";
import { messages } from "./messages";
import { routing } from "./routing";

// Loaded by the next-intl plugin (next.config.ts) for every Server Component render.
export default getRequestConfig(async ({ locale }) => {
	// An explicit locale (e.g. getTranslations({ locale })) wins; otherwise it is the [locale] segment.
	const requested = locale ?? (await localeParam());
	// `dynamicParams = false` does not work with Cache Components, so unknown locales are rejected here.
	if (!hasLocale(routing.locales, requested)) {
		notFound();
	}
	return { locale: requested, messages: messages[requested] };
});
