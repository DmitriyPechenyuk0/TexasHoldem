import { getTranslations } from "next-intl/server";
import { requireViewer } from "@/entities/viewer/index.server";
import { ResendVerification } from "@/features/resend-verification";
import { SignOutButton } from "@/features/sign-out";
import { ROUTES } from "@/shared/config";
import { CardDescription, CardTitle } from "@/shared/ui";

export async function AccountDetails() {
	const viewer = await requireViewer(ROUTES.settings);
	const t = await getTranslations("settings");

	return (
		<>
			<CardTitle>{t("title")}</CardTitle>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
				<dt className="text-muted-foreground">{t("username")}</dt>
				<dd>{viewer.username}</dd>
				<dt className="text-muted-foreground">{t("email")}</dt>
				<dd className="break-all">{viewer.email}</dd>
				<dt className="text-muted-foreground">{t("status")}</dt>
				<dd>{viewer.emailVerified ? t("verified") : t("unverified")}</dd>
			</dl>
			{!viewer.emailVerified && (
				<>
					<CardDescription>{t("verifyHint")}</CardDescription>
					<ResendVerification email={viewer.email} next={ROUTES.settings} />
				</>
			)}
			<SignOutButton variant="secondary" className="self-start" />
		</>
	);
}
