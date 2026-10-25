import { Suspense } from "react";
import { redirectSignedIn } from "@/entities/viewer/index.server";
import { Card } from "@/shared/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

/** Renders nothing: sends a signed-in viewer away, since the form is for the signed-out. */
async function SignedInRedirect() {
	await redirectSignedIn(undefined);
	return null;
}

export function ForgotPasswordPage() {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={null}>
					<SignedInRedirect />
				</Suspense>
				<ForgotPasswordForm />
			</Card>
		</main>
	);
}
