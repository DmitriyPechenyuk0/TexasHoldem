import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { redirectSignedIn } from "@/entities/viewer/index.server";
import {
	fetchOAuthProviders,
	OAuthButtons,
	OAuthError,
} from "@/features/oauth-sign-in";
import { getServerHttp } from "@/shared/api/index.server";
import { ROUTES } from "@/shared/config";
import { Link } from "@/shared/i18n";
import { safeNextPath } from "@/shared/lib";
import { Card, CardDescription, CardTitle, Spinner } from "@/shared/ui";
import { SignInForm } from "./sign-in-form";

export interface SignInSearchParams {
	readonly next?: string | string[];
	/** Why a provider's sign-in failed, from the api's redirect. */
	readonly error?: string | string[];
}

async function SignInContent({
	searchParams,
}: {
	readonly searchParams: Promise<SignInSearchParams>;
}) {
	const { next, error } = await searchParams;
	await redirectSignedIn(next);
	const nextPath = safeNextPath(next);
	const providers = await fetchOAuthProviders(await getServerHttp());
	const t = await getTranslations("auth.signIn");

	return (
		<>
			<CardTitle>{t("title")}</CardTitle>
			<CardDescription>{t("description")}</CardDescription>
			{typeof error === "string" && <OAuthError code={error} />}
			<SignInForm next={nextPath} />
			<OAuthButtons
				providers={providers}
				next={nextPath}
				errorPage={ROUTES.signIn}
			/>
			<p className="text-sm text-muted-foreground">
				{t("noAccount")}{" "}
				<Link
					href={{
						pathname: ROUTES.signUp,
						query: nextPath ? { next: nextPath } : {},
					}}
					className="focus-ring rounded-sm text-foreground underline underline-offset-4"
				>
					{t("signUp")}
				</Link>
			</p>
		</>
	);
}

/** Sign-in with a password or a provider; a signed-in viewer goes on to `next` at once. */
export function SignInPage({
	searchParams,
}: {
	readonly searchParams: Promise<SignInSearchParams>;
}) {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<Spinner className="self-center" />}>
					<SignInContent searchParams={searchParams} />
				</Suspense>
			</Card>
		</main>
	);
}
