import { Suspense } from "react";
import { Card, Spinner } from "@/shared/ui";
import { AccountDetails } from "./account-details";

/** The signed-in player's account. Protected: without a session the visitor goes to sign-in. */
export function SettingsPage() {
	return (
		<main className="flex flex-1 items-start justify-center px-4 py-12">
			<Card className="w-full max-w-md">
				<Suspense fallback={<Spinner className="self-center" />}>
					<AccountDetails />
				</Suspense>
			</Card>
		</main>
	);
}
