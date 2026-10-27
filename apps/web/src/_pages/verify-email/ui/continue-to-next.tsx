"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link, useRouter } from "@/shared/i18n";
import { Button } from "@/shared/ui";

/** How long the confirmation stays before the page moves on by itself. */
const REDIRECT_AFTER_MS = 3_000;

/** Goes on to `href` after a moment, or at once with the button. */
export function ContinueToNext({ href }: { readonly href: string }) {
	const t = useTranslations("auth.verifyEmail.verified");
	const router = useRouter();

	useEffect(() => {
		const timer = setTimeout(() => router.replace(href), REDIRECT_AFTER_MS);
		return () => clearTimeout(timer);
	}, [href, router]);

	return (
		<Button asChild>
			<Link href={href}>{t("continue")}</Link>
		</Button>
	);
}
