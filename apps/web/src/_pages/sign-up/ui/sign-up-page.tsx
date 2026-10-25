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
import { Card, Spinner } from "@/shared/ui";
import { SignUpForm } from "./sign-up-form";

export interface SignUpSearchParams {
	readonly next?: string | string[];
	/** Why a provider's sign-up failed, from the api's redirect. */
	readonly error?: string | string[];
}

async function SignUpContent({
	searchParams,
}: {
	readonly searchParams: Promise<SignUpSearchParams>;
}) {
	const { next, error } = await searchParams;
	await redirectSignedIn(next);
	const nextPath = safeNextPath(next);
	const providers = await fetchOAuthProviders(await getServerHttp());
	const t = await getTranslations("auth.signUp");

	return (
		<>
			{typeof error === "string" && <OAuthError code={error} />}
			<SignUpForm next={nextPath}>
				<OAuthButtons
					providers={providers}
					next={nextPath}
					errorPage={ROUTES.signUp}
				/>
				<p className="text-sm text-muted-foreground">
					{t("haveAccount")}{" "}
					<Link
						href={{
							pathname: ROUTES.signIn,
							query: nextPath ? { next: nextPath } : {},
						}}
						className="focus-ring rounded-sm text-foreground underline underline-offset-4"
					>
						{t("signIn")}
					</Link>
				</p>
			</SignUpForm>
		</>
	);
}

/** A new account with a password or a provider; a signed-in viewer goes on to `next` at once. */
export function SignUpPage({
	searchParams,
}: {
	readonly searchParams: Promise<SignUpSearchParams>;
}) {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<Spinner className="self-center" />}>
					<SignUpContent searchParams={searchParams} />
				</Suspense>
			</Card>
		</main>
	);
}
