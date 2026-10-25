import { Locale, UserId } from "@holdem/shared";
import { Logger } from "@nestjs/common";
import type { EventBus } from "@nestjs/cqrs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins/username";
import type { Mailer } from "@/shared/application/mailer.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import type { Database } from "@/shared/infrastructure/database/index.js";
import {
	AUTH_BASE_PATH,
	CLIENT_IP_HEADER,
} from "../application/auth-http-handler.js";
import { UserRegistered } from "../application/events/user-registered.event.js";
import {
	accounts,
	sessions,
	users,
	verifications,
} from "./persistence/schema.js";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
export const EMAIL_VERIFICATION_EXPIRES_IN = DAY;

/** The only sign-up fields Better Auth may see; `name` is filled from `username`. */
const SIGN_UP_FIELDS = new Set([
	"username",
	"email",
	"password",
	"locale",
	"callbackURL",
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
}

/** Settings from ADR-005 and its addendum; every value that differs from Better Auth's default is deliberate. */
export function createBetterAuth({
	config,
	db,
	mailer,
	eventBus,
}: BetterAuthDependencies) {
	const logger = new Logger("BetterAuth");

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
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
			// Not awaited by design: Mailer.send returns at once, so the answer takes the same time
			// whether or not an email was sent.
			sendVerificationEmail: async ({ user, url }) => {
				mailer.send({
					to: user.email,
					locale: (user as { locale?: string }).locale,
					template: "verify-email",
					params: {
						// `name` mirrors the username.
						username: user.name,
						url,
						expiresInMinutes: EMAIL_VERIFICATION_EXPIRES_IN / 60,
					},
				});
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
		// A database leak alone must not be enough to replay verification or reset links.
		verification: { storeIdentifier: "hashed" },
		// In memory per instance for now; POK-65 moves it to Redis and tunes the rules.
		rateLimit: { enabled: true },
		disabledPaths: [
			// Profile owns display data, and this endpoint accepted any `image`, `javascript:` included.
			"/update-user",
			// OAuth provider tokens never reach the browser.
			"/get-access-token",
			"/refresh-token",
			"/account-info",
		],
		advanced: {
			cookiePrefix: "holdem",
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
				// Better Auth checks callback URLs only on requests that carry cookies, so a sign-up
				// could get an emailed link that leads to another site after verifying.
				const callbackURL = body?.callbackURL;
				if (
					typeof callbackURL === "string" &&
					(!URL.canParse(callbackURL, config.webOrigin) ||
						new URL(callbackURL, config.webOrigin).origin !== config.webOrigin)
				) {
					throw new APIError("FORBIDDEN", {
						code: "INVALID_CALLBACK_URL",
						message: "The callback URL must lead to the web app.",
					});
				}
				if (context.path !== "/sign-up/email" || !body) {
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
						eventBus.publish(
							new UserRegistered(
								UserId.parse(created.id),
								created.username,
								Locale.catch("en").parse(created.locale),
							),
						);
					},
				},
			},
		},
	});
}

export type BetterAuth = ReturnType<typeof createBetterAuth>;

export const BETTER_AUTH = Symbol("BetterAuth");
