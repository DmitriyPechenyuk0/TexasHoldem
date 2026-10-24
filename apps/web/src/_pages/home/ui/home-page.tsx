import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/shared/ui";

export function HomePage() {
	const t = useTranslations("home");

	return (
		<main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
			<h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
			<p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
				{t("tagline")}
			</p>
			<p className="text-sm text-zinc-500">{t("comingSoon")}</p>
			<LocaleSwitcher />
		</main>
	);
}
