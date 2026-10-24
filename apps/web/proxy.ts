import createMiddleware from "next-intl/middleware";
// Only the routing config: the segment's index also brings navigation and, through it, the
// request config, which reads root params that exist only while rendering.
import { routing } from "@/shared/i18n/routing";

// Sends `/` and unprefixed paths to a locale: the cookie from a previous visit, then Accept-Language.
export default createMiddleware(routing);

export const config = {
	// Everything except Next internals and files with an extension.
	matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
