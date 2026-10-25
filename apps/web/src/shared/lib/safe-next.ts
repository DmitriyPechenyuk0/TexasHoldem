const SAME_ORIGIN = "https://same-origin.invalid";

/**
 * The `next` parameter as a path on this site, or null when it leads anywhere else. Only
 * `/`-rooted paths pass: `//evil.example` and `/\evil.example` are other hosts to a browser, and so
 * are absolute URLs, so a link such as `/sign-in?next=https://evil.example` cannot send the user
 * away after signing in (open redirect).
 */
export function safeNextPath(next: unknown): string | null {
	if (
		typeof next !== "string" ||
		!next.startsWith("/") ||
		next.startsWith("//") ||
		// Browsers read a backslash as a slash, and drop tabs and newlines from URLs.
		/[\\\u0000-\u001f\u007f]/u.test(next)
	) {
		return null;
	}
	const url = URL.parse(next, SAME_ORIGIN);
	if (url?.origin !== SAME_ORIGIN) {
		return null;
	}
	return `${url.pathname}${url.search}${url.hash}`;
}
