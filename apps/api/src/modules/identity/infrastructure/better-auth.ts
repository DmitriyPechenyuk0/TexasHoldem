import { Locale, UserId } from "@holdem/shared";
import { SESSION_COOKIE_PREFIX } from "@holdem/shared/contracts/identity";
import { Logger } from "@nestjs/common";
import { and, eq, not } from "drizzle-orm";
import type { EventBus } from "@nestjs/cqrs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
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

/** Better Auth's limits per client address and path, a minute each. */
export const AUTH_RATE_LIMITS = {
	signIn: { window: 60, max: 20 },
	signUp: { window: 60, max: 3 },
	email: { window: 60, max: 3 },
} as const;

/** Body fields that name where a link or a redirect leads. */
const REDIRECT_FIELDS = ["callbackURL", "redirectTo"] as const;

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
}

/** Settings from ADR-005 and its addendum; every value that differs from Better Auth's default is deliberate. */
export function createBetterAuth({
	config,
	db,
	mailer,
	eventBus,
	emailThrottle,
	rateLimiter,
}: BetterAuthDependencies) {
	const logger = new Logger("BetterAuth");

	// Started without awaiting, the throttle included: the answer takes the same time whether or
	// not an email goes out, so it does not tell which addresses have an account.
	const sendLink = (
		template: EmailKind,
		user: { readonly email: string; readonly name: string },
		url: string,
		expiresIn: number,
	): void => {
		void emailThrottle.claim(template, user.email).then((claimed) => {
			if (claimed) {
				mailer.send({
					to: user.email,
					locale: (user as { locale?: string }).locale,
					template,
					// `name` mirrors the username.
					params: {
						username: user.name,
						url,
						expiresInMinutes: expiresIn / 60,
					},
				});
			}
		});
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
				// Every other reset link of the account dies with this one. Among the endpoints we
				// enable, only reset tokens store the bare user id (two-factor would too).
				await db.delete(verifications).where(eq(verifications.value, user.id));
				// The link reached the inbox, which proves the address as well as the verification
				// link would; otherwise the next sign-in would be refused for it.
				const [verified] = await db
					.update(users)
					.set({ emailVerified: true })
					.where(and(eq(users.id, user.id), not(users.emailVerified)))
					.returning({ id: users.id });
				if (verified) {
					eventBus.publish(new UserVerified(UserId.parse(verified.id)));
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
				eventBus.publish(new UserVerified(UserId.parse(user.id)));
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
		session: { expiresIn: 30 * DAY, updateAge: DAY },
		account: { encryptOAuthTokens: true },
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
					after: async (user) => {
						const created = user as typeof user & {
							username: string;
							locale: string;
						};
						const userId = UserId.parse(created.id);
						eventBus.publish(
							new UserRegistered(
								userId,
								created.username,
								Locale.catch("en").parse(created.locale),
							),
						);
						// An OAuth provider that vouches for the email skips the link.
						if (created.emailVerified) {
							eventBus.publish(new UserVerified(userId));
						}
					},
				},
			},
		},
	});
}

export type BetterAuth = ReturnType<typeof createBetterAuth>;

export const BETTER_AUTH = Symbol("BetterAuth");
