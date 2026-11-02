import { z } from "zod";
import { TableId, UserId } from "../common/ids.js";
import { PlayerCard } from "../social/social.js";

// `/api/admin` (POK-114): for accounts with the `admin` role only; anyone else gets 403
// `auth.admin-only`. Every change is audited.

/** A player at a table, as an admin sees them; the card is null for an account without a profile. */
export const AdminSeat = z.object({
	seat: z.int().nonnegative(),
	userId: UserId,
	player: PlayerCard.nullable(),
});
export type AdminSeat = z.infer<typeof AdminSeat>;

/** `GET /api/admin/tables`: every open table, private ones too, newest first. */
export const AdminTable = z.object({
	tableId: TableId,
	name: z.string(),
	visibility: z.enum(["public", "private"]),
	smallBlind: z.int().positive(),
	bigBlind: z.int().positive(),
	maxSeats: z.int().positive(),
	handsPlayed: z.int().nonnegative(),
	createdAt: z.iso.datetime(),
	creator: PlayerCard.nullable(),
	seats: z.array(AdminSeat).readonly(),
});
export type AdminTable = z.infer<typeof AdminTable>;
export const AdminTablesResponse = z.array(AdminTable).readonly();
export type AdminTablesResponse = z.infer<typeof AdminTablesResponse>;

/** `GET /api/admin/users?q=`: an email, or the beginning of a username. */
export const AdminUsersQuery = z.object({
	q: z.string().trim().min(1).max(254),
});
export type AdminUsersQuery = z.infer<typeof AdminUsersQuery>;

/** An account with its profile and the open tables it sits at. */
export const AdminUser = z.object({
	userId: UserId,
	username: z.string().nullable(),
	nickname: z.string().nullable(),
	email: z.string(),
	emailVerified: z.boolean(),
	role: z.enum(["user", "admin"]),
	createdAt: z.iso.datetime(),
	tables: z
		.array(
			z.object({
				tableId: TableId,
				name: z.string(),
				seat: z.int().nonnegative(),
			}),
		)
		.readonly(),
});
export type AdminUser = z.infer<typeof AdminUser>;
export const AdminUsersResponse = z.array(AdminUser).readonly();
export type AdminUsersResponse = z.infer<typeof AdminUsersResponse>;

/** `POST /api/admin/users/:userId/revoke-sessions`: how many sessions ended. */
export const RevokeSessionsResponse = z.object({
	revoked: z.int().nonnegative(),
});
export type RevokeSessionsResponse = z.infer<typeof RevokeSessionsResponse>;

/**
 * What admins did, newest first (`GET /api/admin/audit`). `adminId` is null for a change made
 * outside the app, such as granting a role from the command line.
 */
export const AuditEntry = z.object({
	id: z.uuid(),
	adminId: UserId.nullable(),
	action: z.enum(["force-close-table", "revoke-sessions", "set-role"]),
	target: z.string(),
	details: z.record(z.string(), z.unknown()),
	at: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
export const AuditResponse = z.array(AuditEntry).readonly();
export type AuditResponse = z.infer<typeof AuditResponse>;
