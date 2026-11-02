/** What admins may do, as the audit records it. `set-role` comes from the command line only. */
export type AdminAction = "force-close-table" | "revoke-sessions" | "set-role";

/** One admin action, kept for good: who did what to what, and when. */
export interface AuditEntry {
	readonly id: string;
	/** Null for a change made outside the app (the command line). */
	readonly adminId: string | null;
	readonly action: AdminAction;
	/** The table or user acted on. */
	readonly target: string;
	readonly details: Readonly<Record<string, unknown>>;
	readonly at: Date;
}
