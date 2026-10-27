import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MY_PROFILE_QUERY_KEY } from "@/entities/user";
import { getMyProfile } from "@/entities/user/index.server";
import { VIEWER_QUERY_KEY } from "@/entities/viewer";
import { getViewer } from "@/entities/viewer/index.server";
import { getQueryClient } from "@/shared/api";
import { Link } from "@/shared/i18n";
import { UnverifiedBanner } from "./unverified-banner";
import { UsernameGate } from "./username-gate";
import { ViewerNav } from "./viewer-nav";

/** The bar on every page; `children` is its right side. Also the fallback while the session loads. */
export function SiteHeaderBar({ children }: { readonly children?: ReactNode }) {
	const t = useTranslations("common");

	return (
		<header className="border-b border-border">
			<div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
				<Link
					href="/"
					className="focus-ring rounded-sm font-semibold tracking-tight"
				>
					{t("metadata.title")}
				</Link>
				<div className="flex items-center gap-2">{children}</div>
			</div>
		</header>
	);
}

/**
 * The header with the viewer and their profile, read on the server so a reload shows the
 * signed-in state at once. Both go into the query cache, where `useViewer()` and `useMyProfile()`
 * find them on every page.
 */
export async function SiteHeader() {
	const queryClient = getQueryClient();
	try {
		// Side by side: the header is the first thing the page waits for.
		const [viewer, profile] = await Promise.all([getViewer(), getMyProfile()]);
		queryClient.setQueryData(VIEWER_QUERY_KEY, viewer);
		queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile);
	} catch {
		// The api did not answer: the client asks again.
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<SiteHeaderBar>
				<ViewerNav />
			</SiteHeaderBar>
			<UnverifiedBanner />
			<UsernameGate />
		</HydrationBoundary>
	);
}
