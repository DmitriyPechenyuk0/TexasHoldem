import { z } from "zod";
import { Locale } from "../common/locale.js";

/** The OAuth providers the api supports; each is enabled only when the api has its keys. */
export const OAUTH_PROVIDERS = ["google", "github", "discord"] as const;
export const OAuthProvider = z.enum(OAUTH_PROVIDERS);
export type OAuthProvider = z.infer<typeof OAuthProvider>;

/** Where the browser goes back to on the web origin: a path such as `/en/settings`, or a full URL. */
const webUrl = z.string().max(2048);

/** `GET /api/oauth-providers`: the providers with keys, for the sign-in buttons. Public. */
export const OAuthProvidersResponse = z.object({
	providers: z.array(OAuthProvider),
});
export type OAuthProvidersResponse = z.infer<typeof OAuthProvidersResponse>;

/**
 * `POST /api/auth/sign-in/social`: answers `{ url }`, the provider's page to send the browser to.
 * The provider then sends it back to `callbackURL`, `newUserCallbackURL` for a new account, or
 * `errorCallbackURL?error=<code>` when it failed (`account_not_linked`, `access_denied`, ...).
 * An email of an existing account is never linked silently: that is `account_not_linked`.
 */
export const SignInSocialRequest = z.object({
	provider: OAuthProvider,
	callbackURL: webUrl,
	newUserCallbackURL: webUrl.optional(),
	errorCallbackURL: webUrl.optional(),
	/** The language of a new account's emails. Default: `en`. */
	locale: Locale.optional(),
});
export type SignInSocialRequest = z.infer<typeof SignInSocialRequest>;

/**
 * `POST /api/auth/link-social`, signed in: answers `{ url }` like a sign-in, and the provider's
 * account is added to the viewer's on the way back. Its email may differ from the viewer's.
 */
export const LinkSocialRequest = z.object({
	provider: OAuthProvider,
	callbackURL: webUrl,
	errorCallbackURL: webUrl.optional(),
});
export type LinkSocialRequest = z.infer<typeof LinkSocialRequest>;

/** One way to sign in to the viewer's account: `credential` is the password, others are providers. */
export const LinkedAccount = z.object({
	/** The id to unlink it by. */
	id: z.string(),
	providerId: z.string(),
	createdAt: z.string(),
});
export type LinkedAccount = z.infer<typeof LinkedAccount>;

/** `GET /api/auth/list-accounts`, signed in. */
export const LinkedAccountsResponse = z.array(LinkedAccount);
export type LinkedAccountsResponse = z.infer<typeof LinkedAccountsResponse>;

/**
 * `POST /api/auth/unlink-account`, signed in within the last day (else 403
 * `auth.session-not-fresh`). The last way to sign in cannot go: 400
 * `auth.failed-to-unlink-last-account`.
 */
export const UnlinkAccountRequest = z.object({
	accountId: z.string().min(1).max(64),
});
export type UnlinkAccountRequest = z.infer<typeof UnlinkAccountRequest>;
