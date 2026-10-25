/** The api names its cookies `holdem.*` (Better Auth's `cookiePrefix`). */
export const SESSION_COOKIE_PREFIX = "holdem";

/**
 * The session cookie: plain over HTTP in development, `__Secure-` in production. The web app only
 * checks that one is present, to skip a round trip; the api decides whether it is valid.
 */
export const SESSION_COOKIE_NAMES = [
	`${SESSION_COOKIE_PREFIX}.session_token`,
	`__Secure-${SESSION_COOKIE_PREFIX}.session_token`,
] as const;
