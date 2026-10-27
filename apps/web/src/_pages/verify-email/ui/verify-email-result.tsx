import { getTranslations } from "next-intl/server";
import { getViewer } from "@/entities/viewer/index.server";
import { ResendVerification } from "@/features/resend-verification";
import { ROUTES } from "@/shared/config";
import { safeNextPath } from "@/shared/lib";
import { CardDescription, CardTitle } from "@/shared/ui";
import { verifyEmailState } from "../model/verify-email-state";
import { ContinueToNext } from "./continue-to-next";

export interface VerifyEmailSearchParams {
	readonly error?: string | string[];
	readonly next?: string | string[];
}

export async function VerifyEmailResult({
	searchParams,
}: {
	readonly searchParams: Promise<VerifyEmailSearchParams>;
}) {
	const { error, next } = await searchParams;
	const viewer = await getViewer();
	const state = verifyEmailState(error, viewer);
	const nextPath = safeNextPath(next);
	const t = await getTranslations("auth.verifyEmail");

	if (state === "verified") {
		return (
			<>
				<CardTitle>{t("verified.title")}</CardTitle>
				<CardDescription>
					{t("verified.description", { username: viewer?.username ?? "" })}
				</CardDescription>
				<ContinueToNext href={nextPath ?? ROUTES.home} />
			</>
		);
	}
	return (
		<>
			<CardTitle>{t(`${state}.title`)}</CardTitle>
			<CardDescription>
				{state === "pending" && viewer
					? t("pending.sentTo", { email: viewer.email })
					: t(`${state}.description`)}
			</CardDescription>
			<ResendVerification email={viewer?.email} next={nextPath} />
		</>
	);
}
