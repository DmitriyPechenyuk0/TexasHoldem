"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Link, routing, usePathname } from "@/shared/i18n";

/**
 * Links to the current page in every locale, query string included (an invite code must survive
 * a language switch); following one also stores the choice in a cookie.
 */
export function LocaleSwitcher() {
	return (
		// The query string exists only in the browser: the static HTML links to the bare path.
		<Suspense fallback={<LocaleLinks query={{}} />}>
			<LocaleLinksWithQuery />
		</Suspense>
	);
}

function LocaleLinksWithQuery() {
	const searchParams = useSearchParams();
	return <LocaleLinks query={Object.fromEntries(searchParams)} />;
}

function LocaleLinks({ query }: { readonly query: Record<string, string> }) {
	const t = useTranslations("common.localeSwitcher");
	const current = useLocale();
	const pathname = usePathname();

	return (
		<nav aria-label={t("label")} className="flex gap-4 text-sm">
			{routing.locales.map((locale) => (
				<Link
					key={locale}
					href={{ pathname, query }}
					locale={locale}
					hrefLang={locale}
					aria-current={locale === current ? "true" : undefined}
					className="focus-ring rounded-sm text-muted-foreground underline-offset-4 hover:underline aria-[current=true]:font-semibold aria-[current=true]:text-foreground"
				>
					{t(`locales.${locale}`)}
				</Link>
			))}
		</nav>
	);
}
