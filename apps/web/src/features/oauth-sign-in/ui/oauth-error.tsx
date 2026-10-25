"use client";

import { useTranslations } from "next-intl";

/**
 * Why signing in or linking with a provider failed, from the `?error=` the api's redirect adds:
 * its own codes (`account_not_linked`, ...) or the provider's (`access_denied`). Unknown ones
 * get a general message.
 */
export function OAuthError({ code }: { readonly code: string }) {
	const t = useTranslations("errors.oauth");

	return (
		<p role="alert" className="text-sm text-danger-text">
			{t.has(code as never) ? t(code as never) : t("default")}
		</p>
	);
}
