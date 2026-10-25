"use client";

import { useTranslations } from "next-intl";
import { useViewer } from "@/entities/viewer";
import { SignOutButton } from "@/features/sign-out";
import { ROUTES } from "@/shared/config";
import { Link } from "@/shared/i18n";
import { Button } from "@/shared/ui";

export function ViewerNav() {
	const t = useTranslations("common.header");
	const viewer = useViewer();

	if (viewer === undefined) {
		return null;
	}
	if (viewer === null) {
		return (
			<Button asChild size="sm">
				<Link href={ROUTES.signIn}>{t("signIn")}</Link>
			</Button>
		);
	}
	return (
		<>
			<Button asChild variant="ghost" size="sm">
				<Link
					href={ROUTES.settings}
					aria-label={t("account", { username: viewer.username })}
				>
					{viewer.username}
				</Link>
			</Button>
			<SignOutButton size="sm" />
		</>
	);
}
