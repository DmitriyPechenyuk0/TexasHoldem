"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { MY_PROFILE_QUERY_KEY } from "@/entities/user";
import { http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
	type Locale,
	routing,
	useErrorMessage,
	useRouter,
} from "@/shared/i18n";
import { cn } from "@/shared/lib";
import { Spinner } from "@/shared/ui";
import { updateLocale } from "../api/profile";

/** One language for the interface and the emails: saved, then the page reloads in it. */
export function LanguageTab() {
	const t = useTranslations("settings.language");
	const names = useTranslations("common.localeSwitcher.locales");
	const errorMessage = useErrorMessage();
	const current = useLocale() as Locale;
	const router = useRouter();
	const queryClient = useQueryClient();
	const update = useMutation({
		mutationFn: (locale: Locale) => updateLocale(http, locale),
		onSuccess: (profile) => {
			queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile);
			router.replace(
				{ pathname: ROUTES.settings, query: { tab: "language" } },
				{ locale: profile.locale, scroll: false },
			);
		},
	});

	return (
		<fieldset className="flex flex-col gap-3" disabled={update.isPending}>
			<legend className="mb-1 text-sm text-muted-foreground">
				{t("description")}
			</legend>
			{routing.locales.map((locale) => (
				<label
					key={locale}
					className={cn(
						"flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
					)}
				>
					<input
						type="radio"
						name="locale"
						value={locale}
						checked={(update.variables ?? current) === locale}
						onChange={() => update.mutate(locale)}
						className="accent-primary"
					/>
					<span lang={locale} className="flex-1">
						{names(locale)}
					</span>
					{update.isPending && update.variables === locale && (
						<Spinner size="sm" />
					)}
				</label>
			))}
			{update.isError && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(update.error)}
				</p>
			)}
		</fieldset>
	);
}
