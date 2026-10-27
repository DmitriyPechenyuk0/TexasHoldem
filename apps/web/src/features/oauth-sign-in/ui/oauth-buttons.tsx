"use client";

import type { OAuthProvider } from "@holdem/shared/contracts/identity";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { getPathname, type Locale, useErrorMessage } from "@/shared/i18n";
import { Button } from "@/shared/ui";
import { startOAuthSignIn } from "../api/oauth";
import { PROVIDER_NAMES } from "../model/providers";
import { ProviderIcon } from "./provider-icon";

export interface OAuthButtonsProps {
	readonly providers: readonly OAuthProvider[];
	/** Where to go once signed in, a path on this site. */
	readonly next: string | null;
	/** The page that shows a failure, sign-in or sign-up; it gets `?error=` and `next` back. */
	readonly errorPage: string;
}

/**
 * Sign-in and sign-up with a provider, one button each, under an "or" that follows the password
 * form; nothing without providers. A new account lands on the username step,
 * which moves on to `next` at once when the provider's handle became the username.
 */
export function OAuthButtons({
	providers,
	next,
	errorPage,
}: OAuthButtonsProps) {
	const t = useTranslations("auth.oauth");
	const errorMessage = useErrorMessage();
	const locale = useLocale() as Locale;
	const query = next ? { next } : {};
	const start = useMutation({
		mutationFn: (provider: OAuthProvider) =>
			startOAuthSignIn(http, {
				provider,
				callbackURL: getPathname({ href: next ?? ROUTES.home, locale }),
				newUserCallbackURL: getPathname({
					href: { pathname: ROUTES.chooseUsername, query },
					locale,
				}),
				errorCallbackURL: getPathname({
					href: { pathname: errorPage, query },
					locale,
				}),
				locale,
			}),
		onSuccess: (url) => window.location.assign(url),
	});

	if (providers.length === 0) {
		return null;
	}
	// Busy until the provider's page replaces this one.
	const leaving = start.isPending || start.isSuccess;
	return (
		<div className="flex flex-col gap-2">
			<p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
				{t("or")}
			</p>
			{providers.map((provider) => (
				<Button
					key={provider}
					variant="secondary"
					loading={leaving && start.variables === provider}
					disabled={leaving}
					onClick={() => start.mutate(provider)}
				>
					{!(leaving && start.variables === provider) && (
						<ProviderIcon provider={provider} />
					)}
					{t("continueWith", { provider: PROVIDER_NAMES[provider] })}
				</Button>
			))}
			{start.isError && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(start.error)}
				</p>
			)}
		</div>
	);
}
