import { useTranslations } from "next-intl";
import { ROUTES } from "@/shared/config";
import { Link } from "@/shared/i18n";
import { Button, CardDescription, CardTitle } from "@/shared/ui";

/** An expired, used or broken reset link: the way out is a new one. */
export function InvalidResetLink() {
	const t = useTranslations("auth.resetPassword.invalid");

	return (
		<>
			<CardTitle>{t("title")}</CardTitle>
			<CardDescription>{t("description")}</CardDescription>
			<Button asChild>
				<Link href={ROUTES.forgotPassword}>{t("requestNew")}</Link>
			</Button>
		</>
	);
}
