"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, routing, usePathname } from "@/shared/i18n";

/** Links to the current page in every locale; following one also stores the choice in a cookie. */
export function LocaleSwitcher() {
	const t = useTranslations("common.localeSwitcher");
	const current = useLocale();
	const pathname = usePathname();

	return (
		<nav aria-label={t("label")} className="flex gap-4 text-sm">
			{routing.locales.map((locale) => (
				<Link
					key={locale}
					href={pathname}
					locale={locale}
					hrefLang={locale}
					aria-current={locale === current ? "true" : undefined}
					className="text-zinc-500 underline-offset-4 hover:underline aria-[current=true]:font-semibold aria-[current=true]:text-foreground"
				>
					{t(`locales.${locale}`)}
				</Link>
			))}
		</nav>
	);
}
