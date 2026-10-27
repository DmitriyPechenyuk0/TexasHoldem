"use client";

import type { OAuthProvider } from "@holdem/shared/contracts/identity";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { Viewer } from "@/entities/viewer";
import { ResendVerification } from "@/features/resend-verification";
import { SignOutButton } from "@/features/sign-out";
import { ROUTES } from "@/shared/config";
import { CardDescription } from "@/shared/ui";
import { linkedAccountsQuery } from "../api/sign-in-methods";
import { ChangePasswordForm } from "./change-password-form";
import { SignInMethods } from "./sign-in-methods";

export interface AccountTabProps {
	readonly viewer: Viewer;
	readonly providers: readonly OAuthProvider[];
	/** Why linking a provider failed, from the api's redirect back here. */
	readonly error: string | null;
}

/** The account itself: email, ways to sign in, password, signing out. */
export function AccountTab({ viewer, providers, error }: AccountTabProps) {
	const t = useTranslations("settings");
	const accounts = useQuery(linkedAccountsQuery());
	const hasPassword = accounts.data?.some(
		(account) => account.providerId === "credential",
	);

	return (
		<div className="flex flex-col gap-6">
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
				<dt className="text-muted-foreground">{t("username")}</dt>
				<dd>{viewer.username}</dd>
				<dt className="text-muted-foreground">{t("email")}</dt>
				<dd className="break-all">{viewer.email}</dd>
				<dt className="text-muted-foreground">{t("status")}</dt>
				<dd>{viewer.emailVerified ? t("verified") : t("unverified")}</dd>
			</dl>
			{!viewer.emailVerified && (
				<div className="flex flex-col gap-3">
					<CardDescription>{t("verifyHint")}</CardDescription>
					<ResendVerification email={viewer.email} next={ROUTES.settings} />
				</div>
			)}
			<SignInMethods providers={providers} error={error} />
			{hasPassword !== undefined && (
				<section
					aria-labelledby="change-password"
					className="flex flex-col gap-3"
				>
					<h2 id="change-password" className="text-sm font-medium">
						{t("password.title")}
					</h2>
					{hasPassword ? (
						<ChangePasswordForm />
					) : (
						<p className="text-sm text-muted-foreground">
							{t("password.none")}
						</p>
					)}
				</section>
			)}
			<SignOutButton variant="secondary" className="self-start" />
		</div>
	);
}
