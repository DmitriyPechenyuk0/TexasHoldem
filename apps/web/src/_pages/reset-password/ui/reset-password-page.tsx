import { Suspense } from "react";
import { Card, Spinner } from "@/shared/ui";
import { InvalidResetLink } from "./invalid-reset-link";
import { ResetPasswordForm } from "./reset-password-form";

export interface ResetPasswordSearchParams {
	readonly token?: string | string[];
	readonly error?: string | string[];
}

async function ResetPasswordContent({
	searchParams,
}: {
	readonly searchParams: Promise<ResetPasswordSearchParams>;
}) {
	const { token, error } = await searchParams;
	// The api's link adds `?token=…` once it found the token valid, or `?error=INVALID_TOKEN`.
	return typeof token === "string" && token !== "" && error === undefined ? (
		<ResetPasswordForm token={token} />
	) : (
		<InvalidResetLink />
	);
}

/** Where the emailed reset link leads; open to anyone, signed in or not. */
export function ResetPasswordPage({
	searchParams,
}: {
	readonly searchParams: Promise<ResetPasswordSearchParams>;
}) {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<Spinner className="self-center" />}>
					<ResetPasswordContent searchParams={searchParams} />
				</Suspense>
			</Card>
		</main>
	);
}
