import "server-only";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { getServerHttp } from "@/shared/api/index.server";
import { ROUTES } from "@/shared/config";
import { redirect } from "@/shared/i18n";
import { safeNextPath } from "@/shared/lib";
import { fetchViewer, type Viewer } from "./viewer";

/**
 * The viewer of this request, from its session cookie; one api call per render however many
 * components ask. Reading cookies makes the caller dynamic, so render it inside `<Suspense>`.
 */
export const getViewer = cache(async (): Promise<Viewer | null> =>
	fetchViewer(await getServerHttp()),
);

/**
 * For a protected page: its viewer, or a redirect to sign-in that comes back to `path`. Like
 * every `next`, the path has no locale prefix: links to it add the current one. The proxy already sent visitors without a cookie there; this
 * catches an expired or revoked session.
 */
export async function requireViewer(path: string): Promise<Viewer> {
	const viewer = await getViewer();
	if (!viewer) {
		// `return`: TypeScript narrows on `never` only for functions with a declared type.
		return redirect({
			href: { pathname: ROUTES.signIn, query: { next: path } },
			locale: await getLocale(),
		});
	}
	return viewer;
}

/**
 * For a page only signed-out visitors need (sign-in, sign-up, forgot password): sends a signed-in
 * viewer to `next` when it is a path on this site, else home. The session is checked, not just
 * the cookie, so an expired cookie never bounces between this page and a protected one.
 */
export async function redirectSignedIn(next: unknown): Promise<void> {
	if (await getViewer()) {
		const locale = await getLocale();
		redirect({ href: safeNextPath(next) ?? ROUTES.home, locale });
	}
}
