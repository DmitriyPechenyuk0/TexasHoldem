"use client";

import { useTranslations } from "next-intl";
import { useViewer } from "@/entities/viewer";
import { ResendVerification } from "@/features/resend-verification";

/**
 * For a viewer whose email is not verified, which only an OAuth sign-in can give: they may look
 * around, but not play, until they open the link.
 */
export function UnverifiedBanner() {
	const t = useTranslations("common.unverifiedBanner");
	const viewer = useViewer();

	// Without a username the account is on its way to that step first.
	if (!viewer || viewer.emailVerified || viewer.username === null) {
		return null;
	}
	return (
		<div
			role="region"
			aria-label={t("label")}
			className="border-b border-border bg-surface-muted"
		>
			<div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
				<p>{t("text", { email: viewer.email })}</p>
				<ResendVerification email={viewer.email} className="w-auto" />
			</div>
		</div>
	);
}
