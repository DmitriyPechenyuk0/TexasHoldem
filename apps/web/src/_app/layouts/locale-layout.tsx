import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { routing } from "@/shared/i18n";
import { themeScript } from "@/shared/lib";
import { Toaster, TooltipProvider } from "@/shared/ui";
import { QueryProvider } from "../api/query-provider";
import { fontVariables } from "../styles/fonts";
import "../styles/globals.css";

/** The root layout: every page lives under `/[locale]`. */
export async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
	const locale = await getLocale();

	return (
		// The theme script sets the `dark` class before React hydrates.
		<html
			lang={locale}
			className={`${fontVariables} h-full antialiased`}
			suppressHydrationWarning
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className="flex min-h-full flex-col">
				<NextIntlClientProvider>
					<QueryProvider>
						<TooltipProvider>
							{children}
							<Toaster />
						</TooltipProvider>
					</QueryProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}

// Cache Components need at least one value per root param to build; each locale renders statically.
export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("common.metadata");
	return { title: t("title"), description: t("description") };
}
