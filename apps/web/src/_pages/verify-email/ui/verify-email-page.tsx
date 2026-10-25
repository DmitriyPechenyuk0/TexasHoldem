import { Suspense } from "react";
import { Card, Spinner } from "@/shared/ui";
import {
	type VerifyEmailSearchParams,
	VerifyEmailResult,
} from "./verify-email-result";

/**
 * Where the verification link leads after the api has checked it: signed in and on to `next`,
 * or the reason the link failed, with a way to get a new one. Sign-up lands here too.
 */
export function VerifyEmailPage({
	searchParams,
}: {
	readonly searchParams: Promise<VerifyEmailSearchParams>;
}) {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<Spinner className="self-center" />}>
					<VerifyEmailResult searchParams={searchParams} />
				</Suspense>
			</Card>
		</main>
	);
}
