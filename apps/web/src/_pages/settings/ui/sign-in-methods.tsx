"use client";

import type { OAuthProvider } from "@holdem/shared/contracts/identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
	OAuthError,
	PROVIDER_NAMES,
	ProviderIcon,
} from "@/features/oauth-sign-in";
import { http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { getPathname, type Locale, useErrorMessage } from "@/shared/i18n";
import { Button, Spinner } from "@/shared/ui";
import {
	LINKED_ACCOUNTS_QUERY_KEY,
	linkedAccountsQuery,
	startOAuthLink,
	unlinkAccount,
} from "../api/sign-in-methods";

const isProvider = (id: string): id is OAuthProvider => id in PROVIDER_NAMES;

export interface SignInMethodsProps {
	/** The providers the api has keys for. */
	readonly providers: readonly OAuthProvider[];
	/** Why linking failed, from the api's redirect back here. */
	readonly error: string | null;
}

/**
 * The account's ways to sign in: the password, if it has one, and each provider, to link or
 * unlink. The last way cannot go, and both need a recent sign-in.
 */
export function SignInMethods({ providers, error }: SignInMethodsProps) {
	const t = useTranslations("settings.methods");
	const errorMessage = useErrorMessage();
	const locale = useLocale() as Locale;
	const queryClient = useQueryClient();
	const accounts = useQuery(linkedAccountsQuery());
	const settings = getPathname({
		href: { pathname: ROUTES.settings, query: { tab: "account" } },
		locale,
	});
	const link = useMutation({
		mutationFn: (provider: OAuthProvider) =>
			startOAuthLink(http, {
				provider,
				callbackURL: settings,
				errorCallbackURL: settings,
			}),
		onSuccess: (url) => window.location.assign(url),
	});
	const unlink = useMutation({
		mutationFn: (accountId: string) => unlinkAccount(http, accountId),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: LINKED_ACCOUNTS_QUERY_KEY }),
	});

	if (accounts.isPending) {
		return <Spinner className="self-center" />;
	}
	if (accounts.isError) {
		return (
			<p role="alert" className="text-sm text-danger-text">
				{errorMessage(accounts.error)}
			</p>
		);
	}

	const linked = accounts.data;
	const hasPassword = linked.some(
		(account) => account.providerId === "credential",
	);
	// Every provider with keys, and any linked one that has lost its keys since.
	const shown = [
		...new Set<OAuthProvider>([
			...providers,
			...linked.map((account) => account.providerId).filter(isProvider),
		]),
	];
	const leaving = link.isPending || link.isSuccess;

	return (
		<section aria-labelledby="sign-in-methods" className="flex flex-col gap-3">
			<h2 id="sign-in-methods" className="text-sm font-medium">
				{t("title")}
			</h2>
			{error && <OAuthError code={error} />}
			<ul className="flex flex-col divide-y divide-border rounded-md border border-border">
				{hasPassword && (
					<li className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm">
						<span>{t("password")}</span>
						<span className="text-muted-foreground">{t("linked")}</span>
					</li>
				)}
				{shown.map((provider) => {
					const account = linked.find(
						(candidate) => candidate.providerId === provider,
					);
					const name = PROVIDER_NAMES[provider];
					return (
						<li
							key={provider}
							className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm"
						>
							<span className="flex items-center gap-2">
								<ProviderIcon provider={provider} className="size-4" />
								{name}
							</span>
							{account ? (
								<Button
									size="sm"
									variant="secondary"
									// The api refuses too; the button just says so first.
									disabled={linked.length === 1 || leaving}
									loading={unlink.isPending && unlink.variables === account.id}
									aria-label={t("unlinkLabel", { provider: name })}
									onClick={() => unlink.mutate(account.id)}
								>
									{t("unlink")}
								</Button>
							) : (
								<Button
									size="sm"
									variant="secondary"
									disabled={leaving}
									loading={leaving && link.variables === provider}
									aria-label={t("linkLabel", { provider: name })}
									onClick={() => link.mutate(provider)}
								>
									{t("link")}
								</Button>
							)}
						</li>
					);
				})}
			</ul>
			{/* Only a provider has an Unlink button to explain; the password has none. */}
			{linked.length === 1 && linked[0]?.providerId !== "credential" && (
				<p className="text-xs text-muted-foreground">{t("lastMethod")}</p>
			)}
			{(link.isError || unlink.isError) && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(link.error ?? unlink.error)}
				</p>
			)}
		</section>
	);
}
