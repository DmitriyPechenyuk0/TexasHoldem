import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { LocaleSwitcher, ThemeSwitcher } from "@/shared/ui";
import { PrefetchedServerClock } from "./prefetched-server-clock";

export function HomePage() {
	const t = useTranslations("home");

	return (
		<main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
			<h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
			<p className="max-w-md text-lg text-muted-foreground">{t("tagline")}</p>
			<p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
			<Suspense
				fallback={
					<p className="text-sm text-muted-foreground">
						{t("serverClock.syncing")}
					</p>
				}
			>
				<PrefetchedServerClock />
			</Suspense>
			<div className="flex items-center gap-4">
				<LocaleSwitcher />
				<ThemeSwitcher />
			</div>
		</main>
	);
}
