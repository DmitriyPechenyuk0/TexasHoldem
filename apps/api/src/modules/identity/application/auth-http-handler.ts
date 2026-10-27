import { API_PREFIX } from "@holdem/shared";

/** Where Better Auth's endpoints live: `/api/auth/sign-up/email`, `/api/auth/sign-in/username`, … */
export const AUTH_BASE_PATH = `${API_PREFIX}/auth`;

/**
 * The client address, set by the HTTP mount from Express's `req.ip` (which follows TRUST_PROXY).
 * Better Auth reads only this header: by default it trusts a client-sent `X-Forwarded-For`, so
 * rotating that header would give a fresh rate-limit bucket on every request.
 */
export const CLIENT_IP_HEADER = "x-holdem-client-ip";

/**
 * Port for Better Auth's own HTTP API (sign-up, sign-in, sign-out, email verification, …) as a
 * fetch handler. Identity is a generic context: these endpoints are Better Auth's, not commands.
 */
export abstract class AuthHttpHandler {
	abstract handle(request: Request): Promise<Response>;
}
