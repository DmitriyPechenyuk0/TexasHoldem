import { boolean, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contextTable } from "@/shared/infrastructure/database/index.js";

// Better Auth's four tables (user, session, account, verification) with the columns its core and
// the username plugin expect. Better Auth owns them: change them only alongside an upgrade or a new
// plugin, comparing with `npx auth@<version> generate`, whose output serves as a reference only.
const table = contextTable("identity");

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () =>
	timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

export const users = table("users", {
	id: id(),
	/**
	 * Mirrors `username`: Better Auth requires a name, and display names belong to Profile. Until
	 * an OAuth account has chosen its username, the provider's name, shown nowhere: anyone can set
	 * it to any text, so emails greet by the username or by no name.
	 */
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull().default(false),
	/** Unused: avatars belong to Profile. Kept because Better Auth reads and writes it. */
	image: text(),
	/**
	 * Lowercase, unique. Null only for an account an OAuth sign-in created without a usable
	 * handle, until it chooses one; such an account is not announced to other contexts before.
	 */
	username: text().unique(),
	/** The language of the user's emails. */
	locale: text().notNull().default("en"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const sessions = table(
	"sessions",
	{
		id: id(),
		/** Stored as is by Better Auth's design; the cookie also carries an HMAC with AUTH_SECRET. */
		token: text().notNull().unique(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		ipAddress: text(),
		userAgent: text(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(sessions) => [index().on(sessions.userId)],
);

/** Ways to sign in: `credential` holds the password hash, OAuth providers their (encrypted) tokens. */
export const accounts = table(
	"accounts",
	{
		id: id(),
		accountId: text().notNull(),
		providerId: text().notNull(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text(),
		refreshToken: text(),
		idToken: text(),
		accessTokenExpiresAt: timestamp({ withTimezone: true }),
		refreshTokenExpiresAt: timestamp({ withTimezone: true }),
		scope: text(),
		password: text(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(accounts) => [index().on(accounts.userId)],
);

/** Email verification and password reset tokens, stored hashed. */
export const verifications = table(
	"verifications",
	{
		id: id(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(verifications) => [index().on(verifications.identifier)],
);
