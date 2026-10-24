import { useTranslations } from "next-intl";
import { Link } from "@/shared/i18n";

/** Shown inside the locale layout whenever a page under `/[locale]` calls `notFound()`. */
export function NotFoundPage() {
	const t = useTranslations("common.notFound");

	return (
		<main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
			<p className="max-w-md text-zinc-600 dark:text-zinc-400">
				{t("description")}
			</p>
			<Link href="/" className="underline underline-offset-4">
				{t("home")}
			</Link>
		</main>
	);
}
