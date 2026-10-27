import { Locale, UserId } from "@holdem/shared";
import {
	type OAuthProvider,
	SESSION_COOKIE_PREFIX,
	Username,
} from "@holdem/shared/contracts/identity";
import { Logger } from "@nestjs/common";
import { and, eq, not } from "drizzle-orm";
import type { EventBus } from "@nestjs/cqrs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	addOAuthServerContext,
	createAuthMiddleware,
	getOAuthState,
	getSessionFromCtx,
} from "better-auth/api";
import { username } from "better-auth/plugins/username";
import type { Mailer } from "@/shared/application/mailer.js";
import type { RateLimiter } from "@/shared/application/rate-limiter.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import type { Database } from "@/shared/infrastructure/database/index.js";
import {
	AUTH_BASE_PATH,
	CLIENT_IP_HEADER,
} from "../application/auth-http-handler.js";
import { UserRegistered } from "../application/events/user-registered.event.js";
import { UserVerified } from "../application/events/user-verified.event.js";
import type { PasswordBreaches } from "../application/password-breaches.js";
import { enabledOAuthProviders } from "./configured-oauth-providers.js";
import type { EmailKind, EmailThrottle } from "./email-throttle.js";
import {
	accounts,
	sessions,
	users,
	verifications,
} from "./persistence/schema.js";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
export const EMAIL_VERIFICATION_EXPIRES_IN = DAY;
export const PASSWORD_RESET_EXPIRES_IN = HOUR;
/** How recent a sign-in must be to link or unlink a provider: a stolen session alone is not enough. */
export const FRESH_SESSION_AGE = HOUR;

/** Better Auth's limits per client address and path, a minute each. */
export const AUTH_RATE_LIMITS = {
	signIn: { window: 60, max: 20 },
	signUp: { window: 60, max: 3 },
	email: { window: 60, max: 3 },
} as const;

/** Body fields that name where a link or a redirect leads. */
const REDIRECT_FIELDS = [
	"callbackURL",
	"redirectTo",
	"newUserCallbackURL",
	"errorCallbackURL",
] as const;

/** The endpoint every OAuth provider sends the browser back to: `/callback/google`, ... */
const isOAuthCallback = (path: string | undefined): boolean =>
	path?.startsWith("/callback/") ?? false;

/** Longest provider name kept as `name` until the username is chosen. Emails never show it. */
const MAX_PROVIDER_NAME = 64;

/** How emails name a provider. */
const PROVIDER_NAMES: Readonly<Record<OAuthProvider, string>> = {
	google: "Google",
	github: "GitHub",
	discord: "Discord",
};

/** Where each endpoint that sets a password carries the new one. */
const NEW_PASSWORD_FIELD: Readonly<Record<string, string>> = {
	"/sign-up/email": "password",
	"/reset-password": "newPassword",
	"/change-password": "newPassword",
};

/** The only sign-up fields Better Auth may see; `name` is filled from `username`. */
const SIGN_UP_FIELDS = new Set([
	"username",
	"email",
	"password",
	"locale",
	"callbackURL",
]);

/** Endpoints whose email links lead to `callbackURL`, `/` of the api by default. */
const SENDS_VERIFICATION_LINK = new Set([
	"/sign-up/email",
	"/sign-in/email",
	"/sign-in/username",
	"/send-verification-email",
]);

/** Better Auth's log levels on Nest's logger: its routine messages are debug output for us. */
const LOG_METHOD = {
	error: "error",
	warn: "warn",
	info: "debug",
	success: "debug",
	debug: "debug",
} as const;

export interface BetterAuthDependencies {
	readonly config: AppConfig;
	readonly db: Database;
	readonly mailer: Mailer;
	readonly eventBus: EventBus;
	readonly emailThrottle: EmailThrottle;
	readonly rateLimiter: RateLimiter;
	readonly passwordBreaches: PasswordBreaches;
}

/** Settings from ADR-005 and its addendum; every value that differs from Better Auth's default is deliberate. */
export function createBetterAuth({
	config,
	db,
	mailer,
	eventBus,
	emailThrottle,
	rateLimiter,
	passwordBreaches,
}: BetterAuthDependencies) {
	const logger = new Logger("BetterAuth");
	const oauth = config.auth.oauth;

	// Other contexts learn of an account once it has a username, so `UserVerified` never comes
	// before `UserRegistered`; choosing the username announces both (ChooseUsernameHandler).
	const announceVerified = (user: { id: string; username?: unknown }) => {
		if (typeof user.username === "string") {
			eventBus.publish(new UserVerified(UserId.parse(user.id)));
		}
	};

	/**
	 * A provider's handle becomes the username of a new account when it is valid and free. If not,
	 * the account starts without one and the web app asks for it. A sign-up that takes the same
	 * name in between makes this account fail with `USERNAME_IS_ALREADY_TAKEN`; trying again works.
	 */
	const usernameFromHandle = async (
		handle: unknown,
	): Promise<{ username?: string }> => {
		if (typeof handle !== "string" || !Username.safeParse(handle).success) {
			return {};
		}
		const username = handle.toLowerCase();
		const [taken] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, username))
			.limit(1);
		return taken ? {} : { username };
	};

	/** The username an email greets by; `name` may still hold the provider's, which anyone sets. */
	const usernameOf = (user: object): string | null => {
		const { username } = user as { username?: unknown };
		return typeof username === "string" ? username : null;
	};

	// Started without awaiting, the throttle included: the answer takes the same time whether or
	// not an email goes out, so it does not tell which addresses have an account.
	const sendLink = (
		template: EmailKind,
		user: { readonly email: string },
		url: string,
		expiresIn: number,
	): void => {
		void emailThrottle.claim(template, user.email).then((claimed) => {
			if (claimed) {
				mailer.send({
					to: user.email,
					locale: (user as { locale?: string }).locale,
					template,
					params: {
						username: usernameOf(user),
						url,
						expiresInMinutes: expiresIn / 60,
					},
				});
			}
		});
	};

	/**
	 * Tells the owner that the ways into the account changed, so a stranger who did it with a stolen
	 * session is noticed. Not throttled: only a signed-in owner, or a reset link, triggers it.
	 */
	const notifyOwner = async (
		userId: string,
		notice:
			| { readonly template: "password-changed" }
			| {
					readonly template: "sign-in-method-added";
					readonly provider: string;
			  },
	): Promise<void> => {
		const [owner] = await db
			.select({
				email: users.email,
				username: users.username,
				locale: users.locale,
			})
			.from(users)
			.where(eq(users.id, userId));
		if (!owner) {
			return;
		}
		const locale = Locale.catch("en").parse(owner.locale);
		const url = `${config.webOrigin}/${locale}/settings?tab=account`;
		mailer.send(
			notice.template === "password-changed"
				? {
						to: owner.email,
						locale,
						template: notice.template,
						params: { username: owner.username, url },
					}
				: {
						to: owner.email,
						locale,
						template: notice.template,
						params: {
							username: owner.username,
							provider: notice.provider,
							url,
						},
					},
		);
	};

	return betterAuth({
		appName: "Texas Hold'em",
		// Links in emails start here, never from the request's Host (Host poisoning).
		baseURL: config.apiOrigin,
		basePath: AUTH_BASE_PATH,
		secret: config.auth.secret,
		// Callback and redirect URLs may only lead to the web app.
		trustedOrigins: [config.webOrigin],
		telemetry: { enabled: false },
		logger: { log: (level, message) => logger[LOG_METHOD[level]](message) },
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: {
				user: users,
				session: sessions,
				account: accounts,
				verification: verifications,
			},
			transaction: true,
		}),
		emailAndPassword: {
			enabled: true,
			// No session before the email is verified; this also makes a taken email answer exactly
			// like a new one (sign-up enumeration protection).
			requireEmailVerification: true,
			minPasswordLength: 10,
			maxPasswordLength: 128,
			// The reset token is a random id stored hashed (`storeIdentifier` below) and used once.
			resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN,
			sendResetPassword: async ({ user, url }) => {
				sendLink("reset-password", user, url, PASSWORD_RESET_EXPIRES_IN);
			},
			// Whoever held the old password, or a stolen session, is signed out everywhere.
			revokeSessionsOnPasswordReset: true,
			onPasswordReset: async ({ user }) => {
				await notifyOwner(user.id, { template: "password-changed" });
				// Every other reset link of the account dies with this one. Among the endpoints we
				// enable, only reset tokens store the bare user id (two-factor would too).
				await db.delete(verifications).where(eq(verifications.value, user.id));
				// The link reached the inbox, which proves the address as well as the verification
				// link would; otherwise the next sign-in would be refused for it.
				const [verified] = await db
					.update(users)
					.set({ emailVerified: true })
					.where(and(eq(users.id, user.id), not(users.emailVerified)))
					.returning({ id: users.id, username: users.username });
				if (verified) {
					announceVerified(verified);
				}
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			// A correct password on an unverified account sends the link again, under the throttle.
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			// The link is a JWT signed with AUTH_SECRET, not a database row: nothing to leak or to reuse,
			// since a verified account gets no session from it.
			expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
			sendVerificationEmail: async ({ user, url }) => {
				sendLink("verify-email", user, url, EMAIL_VERIFICATION_EXPIRES_IN);
			},
			afterEmailVerification: async (user) => {
				announceVerified(user);
			},
		},
		user: {
			additionalFields: {
				locale: {
					type: "string",
					required: false,
					defaultValue: "en",
					input: true,
				},
			},
		},
		// Linking and unlinking providers need a sign-in younger than `freshAge`.
		session: {
			expiresIn: 30 * DAY,
			updateAge: DAY,
			freshAge: FRESH_SESSION_AGE,
		},
		// Only providers with keys exist; their callback is `${API_ORIGIN}/api/auth/callback/<id>`.
		socialProviders: {
			...(oauth.google && {
				// Google has no handle: a new account always chooses its username.
				google: { ...oauth.google, prompt: "select_account" },
			}),
			...(oauth.github && {
				github: {
					...oauth.github,
					mapProfileToUser: (profile) => usernameFromHandle(profile.login),
				},
			}),
			...(oauth.discord && {
				discord: {
					...oauth.discord,
					mapProfileToUser: (profile) => usernameFromHandle(profile.username),
				},
			}),
		},
		account: {
			encryptOAuthTokens: true,
			accountLinking: {
				enabled: true,
				// A provider account is never added to an existing one because their emails match:
				// whoever holds that address at the provider would get in. The sign-in fails with
				// `account_not_linked`; the owner signs in and links the provider from settings.
				disableImplicitLinking: true,
				// Linking is always explicit, by the signed-in owner, so whether the provider
				// verified its email, or which email it is, does not matter.
				trustedProviders: enabledOAuthProviders(config),
				allowDifferentEmails: true,
			},
		},
		// An OAuth failure without its own `errorCallbackURL` lands on sign-in, with `?error=<code>`.
		onAPIError: { errorURL: `${config.webOrigin}/sign-in` },
		// A database leak alone must not be enough to use a reset link. Verification links are
		// signed JWTs and never stored.
		verification: { storeIdentifier: "hashed" },
		// Per client address and path, in Redis for every instance. On top of these, the HTTP mount
		// allows 5 sign-ins a minute per address and identifier, and EmailThrottle bounds the emails
		// per recipient.
		rateLimit: {
			enabled: true,
			window: 60,
			max: 100,
			customRules: {
				// Loose, for many users behind one NAT; the per-identifier limit is the tight one.
				"/sign-in/*": AUTH_RATE_LIMITS.signIn,
				"/sign-up/email": AUTH_RATE_LIMITS.signUp,
				"/send-verification-email": AUTH_RATE_LIMITS.email,
				"/request-password-reset": AUTH_RATE_LIMITS.email,
				// Guesses at the current password, from a stolen session.
				"/change-password": AUTH_RATE_LIMITS.signIn,
			},
			customStorage: {
				consume: async (key, { window, max }) => {
					const decision = await rateLimiter.consume(`auth:${key}`, {
						max,
						windowSeconds: window,
					});
					return decision.allowed
						? { allowed: true, retryAfter: null }
						: { allowed: false, retryAfter: decision.retryAfterSeconds };
				},
			},
		},
		disabledPaths: [
			// Profile owns display data, and this endpoint accepted any `image`, `javascript:` included.
			"/update-user",
			// OAuth provider tokens never reach the browser.
			"/get-access-token",
			"/refresh-token",
			"/account-info",
			// Answers whether a password is the current one: from a stolen session, a guessing oracle
			// that sends no email and skips the tight limit of `/change-password`. The web app needs none.
			"/verify-password",
		],
		advanced: {
			cookiePrefix: SESSION_COOKIE_PREFIX,
			// Secure cookies get the `__Secure-` prefix; Better Auth would otherwise read NODE_ENV itself.
			useSecureCookies: config.nodeEnv === "production",
			ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
			database: { generateId: "uuid" },
		},
		plugins: [
			username({
				minUsernameLength: 3,
				maxUsernameLength: 20,
				usernameValidator: (value) => /^[A-Za-z0-9_]+$/.test(value),
				displayUsername: false,
			}),
		],
		hooks: {
			// Defence in depth behind the HTTP contract: server-side calls skip the mount. A returned
			// context is merged into the original, so unknown keys are deleted in place.
			before: createAuthMiddleware(async (context) => {
				const body = context.body as Record<string, unknown> | undefined;
				if (!body) {
					return;
				}
				// Better Auth checks callback URLs only on requests that carry cookies, so a sign-up
				// could get an emailed link that leads to another site after verifying.
				for (const field of REDIRECT_FIELDS) {
					const value = body[field];
					if (typeof value !== "string") {
						continue;
					}
					const target = URL.canParse(value, config.webOrigin)
						? new URL(value, config.webOrigin)
						: undefined;
					if (target?.origin !== config.webOrigin) {
						throw new APIError("FORBIDDEN", {
							code: "INVALID_CALLBACK_URL",
							message: "The callback URL must lead to the web app.",
						});
					}
					// Better Auth would resolve a relative URL against the api.
					body[field] = target.href;
				}
				if (
					body.callbackURL === undefined &&
					SENDS_VERIFICATION_LINK.has(context.path)
				) {
					body.callbackURL = `${config.webOrigin}/`;
				}
				if (context.path === "/link-social") {
					// Better Auth asks only for a session here, while unlinking needs a fresh one.
					// Otherwise a stolen session could add the thief's provider and keep the account
					// even after the owner changes the password.
					const session = await getSessionFromCtx(context);
					const signedInAt = session && new Date(session.session.createdAt);
					if (
						signedInAt &&
						Date.now() - signedInAt.getTime() >= FRESH_SESSION_AGE * 1000
					) {
						throw new APIError("FORBIDDEN", {
							code: "SESSION_NOT_FRESH",
							message: "Sign in again to change the ways to sign in.",
						});
					}
					return;
				}
				const passwordField = NEW_PASSWORD_FIELD[context.path];
				const newPassword = passwordField && body[passwordField];
				// Before Better Auth looks the email up, so a sign-up answers the same for a taken one.
				if (
					typeof newPassword === "string" &&
					(await passwordBreaches.isBreached(newPassword))
				) {
					throw new APIError("BAD_REQUEST", {
						code: "PASSWORD_COMPROMISED",
						message:
							"This password appeared in a data breach. Choose another one.",
					});
				}
				if (context.path === "/sign-in/social") {
					// Kept in the state on the server, unlike `additionalData`, which the contract
					// drops: the client cannot forge it on the way back.
					await addOAuthServerContext({ locale: body.locale });
					return;
				}
				if (context.path !== "/sign-up/email") {
					return;
				}
				for (const key of Object.keys(body)) {
					if (!SIGN_UP_FIELDS.has(key)) {
						delete body[key];
					}
				}
				// The username plugin stores the username in lowercase; the name mirrors that.
				body.name = String(body.username).toLowerCase();
			}),
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user, context) => {
						if (!isOAuthCallback(context?.path)) {
							return;
						}
						// Anyone can give a provider someone else's address without verifying it. An
						// account made from it would become that person's once they reset the password
						// or follow a verification link, with the stranger's provider still linked.
						if (!user.emailVerified) {
							throw new APIError("FORBIDDEN", {
								code: "email_not_verified",
								message: "The provider has not verified this email address.",
							});
						}
						const created = user as typeof user & { username?: string };
						const locale = Locale.safeParse(
							(await getOAuthState())?.serverContext?.locale,
						);
						return {
							data: {
								...user,
								name:
									created.username ??
									(created.name.trim().slice(0, MAX_PROVIDER_NAME) ||
										created.email.split("@")[0]),
								// Avatars belong to Profile; the provider's picture is not kept.
								image: null,
								locale: locale.success ? locale.data : "en",
							},
						};
					},
					after: async (user) => {
						const created = user as typeof user & {
							username: string | null;
							locale: string;
						};
						// Announced once it has chosen one.
						if (typeof created.username !== "string") {
							return;
						}
						const userId = UserId.parse(created.id);
						eventBus.publish(
							new UserRegistered(
								userId,
								created.username,
								Locale.catch("en").parse(created.locale),
							),
						);
						// An OAuth sign-up always has a verified email; an email one gets it by the link.
						if (created.emailVerified) {
							eventBus.publish(new UserVerified(userId));
						}
					},
				},
			},
			account: {
				create: {
					after: async (account, context) => {
						// A provider added to an existing account; a sign-up links its first one.
						if (
							isOAuthCallback(context?.path) &&
							(await getOAuthState())?.link &&
							account.providerId in PROVIDER_NAMES
						) {
							await notifyOwner(account.userId, {
								template: "sign-in-method-added",
								provider: PROVIDER_NAMES[account.providerId as OAuthProvider],
							});
						}
					},
				},
			},
			session: {
				create: {
					after: async (session, context) => {
						// The contract makes a password change always end every session and start this
						// one; a reset tells the owner from `onPasswordReset`.
						if (context?.path === "/change-password") {
							await notifyOwner(session.userId, {
								template: "password-changed",
							});
						}
					},
				},
			},
		},
	});
}

export type BetterAuth = ReturnType<typeof createBetterAuth>;

export const BETTER_AUTH = Symbol("BetterAuth");
