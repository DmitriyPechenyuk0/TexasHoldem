/** Paths of the app's pages, without the locale prefix that `Link`, `redirect` and the proxy add. */
export const ROUTES = {
	home: "/",
	signIn: "/sign-in",
	signUp: "/sign-up",
	chooseUsername: "/choose-username",
	settings: "/settings",
	verifyEmail: "/verify-email",
	forgotPassword: "/forgot-password",
	resetPassword: "/reset-password",
	profile: "/profile",
} as const;

/** A player's public profile. */
export const profilePath = (username: string): string =>
	`${ROUTES.profile}/${encodeURIComponent(username)}`;

/**
 * Pages that need a session, with everything under them. Without a session cookie the proxy sends
 * the visitor to sign-in with `?next=` before any rendering; the page checks the session itself too.
 */
export const PROTECTED_ROUTES: readonly string[] = [
	ROUTES.settings,
	ROUTES.chooseUsername,
];

/** Whether a path without its locale prefix is a protected page or lies under one. */
export const isProtectedRoute = (path: string): boolean =>
	PROTECTED_ROUTES.some(
		(route) => path === route || path.startsWith(`${route}/`),
	);

/**
 * Where the proxy sends a visitor without a session cookie: sign-in in the same locale, coming
 * back to the protected page afterwards. Null when the path is not protected or a cookie is there
 * (the page then checks the session itself).
 */
export function signInRedirectFor(
	pathname: string,
	search: string,
	hasSessionCookie: boolean,
	locales: readonly string[],
): string | null {
	const [, locale = "", ...rest] = pathname.split("/");
	const path = `/${rest.join("/")}`;
	if (
		hasSessionCookie ||
		!locales.includes(locale) ||
		!isProtectedRoute(path)
	) {
		return null;
	}
	return `/${locale}${ROUTES.signIn}?${new URLSearchParams({ next: `${path}${search}` })}`;
}
