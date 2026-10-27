import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MY_PROFILE_QUERY_KEY } from "@/entities/user";
import { getMyProfile } from "@/entities/user/index.server";
import { requireViewer } from "@/entities/viewer/index.server";
import { fetchOAuthProviders } from "@/features/oauth-sign-in";
import { getQueryClient } from "@/shared/api";
import { getServerHttp } from "@/shared/api/index.server";
import { ROUTES } from "@/shared/config";
import { Card, CardTitle, Spinner } from "@/shared/ui";
import { isSettingsTab } from "../model/settings-tab";
import { SettingsTabs } from "./settings-tabs";

export interface SettingsSearchParams {
	readonly tab?: string | string[];
	/** Why linking a provider failed, from the api's redirect back here. */
	readonly error?: string | string[];
}

async function SettingsContent({
	searchParams,
}: {
	readonly searchParams: Promise<SettingsSearchParams>;
}) {
	const { tab, error } = await searchParams;
	const viewer = await requireViewer(ROUTES.settings);
	const queryClient = getQueryClient();
	const [profile, providers, t] = await Promise.all([
		getMyProfile(),
		fetchOAuthProviders(await getServerHttp()),
		getTranslations("settings"),
	]);
	queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<CardTitle>{t("title")}</CardTitle>
			<SettingsTabs
				// A provider's failed link comes back with an error to show on the account tab.
				tab={isSettingsTab(tab) ? tab : error ? "account" : "profile"}
				viewer={viewer}
				providers={providers}
				error={typeof error === "string" ? error : null}
			/>
		</HydrationBoundary>
	);
}

/** The signed-in player's profile, account and language. Protected: without a session, sign-in. */
export function SettingsPage({
	searchParams,
}: {
	readonly searchParams: Promise<SettingsSearchParams>;
}) {
	return (
		<main className="flex flex-1 items-start justify-center px-4 py-12">
			<Card className="w-full max-w-lg">
				<Suspense fallback={<Spinner className="self-center" />}>
					<SettingsContent searchParams={searchParams} />
				</Suspense>
			</Card>
		</main>
	);
}
