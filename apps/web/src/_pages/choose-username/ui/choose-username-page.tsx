import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireViewer } from "@/entities/viewer/index.server";
import { ROUTES } from "@/shared/config";
import { redirect } from "@/shared/i18n";
import { safeNextPath } from "@/shared/lib";
import { Card, CardDescription, CardTitle, Spinner } from "@/shared/ui";
import { ChooseUsernameForm } from "./choose-username-form";

export interface ChooseUsernameSearchParams {
	readonly next?: string | string[];
}

async function ChooseUsernameContent({
	searchParams,
}: {
	readonly searchParams: Promise<ChooseUsernameSearchParams>;
}) {
	const { next } = await searchParams;
	const nextPath = safeNextPath(next);
	// Never back here, which would go round in circles.
	const target =
		nextPath && !nextPath.startsWith(ROUTES.chooseUsername)
			? nextPath
			: ROUTES.home;
	const viewer = await requireViewer(
		nextPath
			? `${ROUTES.chooseUsername}?${new URLSearchParams({ next: nextPath })}`
			: ROUTES.chooseUsername,
	);
	// A provider's handle became the username, or it was chosen already.
	if (viewer.username !== null) {
		redirect({ href: target, locale: await getLocale() });
	}
	const t = await getTranslations("auth.chooseUsername");

	return (
		<>
			<CardTitle>{t("title")}</CardTitle>
			<CardDescription>{t("description")}</CardDescription>
			<ChooseUsernameForm next={target} />
		</>
	);
}

/**
 * The step after a provider's first sign-in when its handle could not become the username: the
 * account can look around, but not play, until it has one. New provider accounts land here, and
 * every page sends a viewer without a username here.
 */
export function ChooseUsernamePage({
	searchParams,
}: {
	readonly searchParams: Promise<ChooseUsernameSearchParams>;
}) {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<Spinner className="self-center" />}>
					<ChooseUsernameContent searchParams={searchParams} />
				</Suspense>
			</Card>
		</main>
	);
}
