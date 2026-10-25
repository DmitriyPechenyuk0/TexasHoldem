import { SESSION_COOKIE_NAMES } from "@holdem/shared/contracts/identity";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
// Only these modules: the segments' indexes also bring the environment check and navigation, whose
// request config reads root params that exist only while rendering.
import { signInRedirectFor } from "@/shared/config/routes";
import { routing } from "@/shared/i18n/routing";

// Sends `/` and unprefixed paths to a locale: the cookie from a previous visit, then Accept-Language.
const localeRouting = createMiddleware(routing);

/**
 * Before anything renders, a protected page without a session cookie redirects to sign-in. Only
 * the cookie's presence is checked here; the page checks the session, so a stale cookie still
 * ends on sign-in, one render later.
 */
export default function proxy(request: NextRequest) {
	const signIn = signInRedirectFor(
		request.nextUrl.pathname,
		request.nextUrl.search,
		SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name)),
		routing.locales,
	);
	return signIn
		? NextResponse.redirect(new URL(signIn, request.url))
		: localeRouting(request);
}

export const config = {
	// Everything except Next internals and files with an extension.
	matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
