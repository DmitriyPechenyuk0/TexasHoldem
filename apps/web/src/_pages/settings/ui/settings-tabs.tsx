"use client";

import type { OAuthProvider } from "@holdem/shared/contracts/identity";
import { useTranslations } from "next-intl";
import type { Viewer } from "@/entities/viewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { SETTINGS_TABS, type SettingsTab } from "../model/settings-tab";
import { AccountTab } from "./account-tab";
import { LanguageTab } from "./language-tab";
import { ProfileTab } from "./profile-tab";

export interface SettingsTabsProps {
	readonly tab: SettingsTab;
	readonly viewer: Viewer;
	readonly providers: readonly OAuthProvider[];
	readonly error: string | null;
}

/** The open tab is kept in `?tab=`, so a reload or a provider's redirect comes back to it. */
export function SettingsTabs({
	tab,
	viewer,
	providers,
	error,
}: SettingsTabsProps) {
	const t = useTranslations("settings.tabs");

	const remember = (value: string) => {
		const url = new URL(window.location.href);
		url.searchParams.set("tab", value);
		url.searchParams.delete("error");
		window.history.replaceState(null, "", url);
	};

	return (
		<Tabs
			defaultValue={tab}
			onValueChange={remember}
			className="flex flex-col gap-6"
		>
			<TabsList className="self-start">
				{SETTINGS_TABS.map((value) => (
					<TabsTrigger key={value} value={value}>
						{t(value)}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent value="profile">
				<ProfileTab />
			</TabsContent>
			<TabsContent value="account">
				<AccountTab viewer={viewer} providers={providers} error={error} />
			</TabsContent>
			<TabsContent value="language">
				<LanguageTab />
			</TabsContent>
		</Tabs>
	);
}
