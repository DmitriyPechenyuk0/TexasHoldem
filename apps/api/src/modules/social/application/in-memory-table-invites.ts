import { type PendingInvite, TableInvites } from "./table-invites.js";

/** Table invites for handler tests, with the Redis one's rules. */
export class InMemoryTableInvites extends TableInvites {
	/** By invitee, then `inviterId:tableId`. */
	readonly invites = new Map<string, Map<string, PendingInvite>>();

	async add(
		inviteeId: string,
		inviterId: string,
		tableId: string,
		expiresAt: Date,
	): Promise<void> {
		const invites = this.invites.get(inviteeId) ?? new Map();
		invites.set(`${inviterId}:${tableId}`, { inviterId, tableId, expiresAt });
		this.invites.set(inviteeId, invites);
	}

	async take(
		inviteeId: string,
		inviterId: string,
		tableId: string,
		now: Date,
	): Promise<boolean> {
		const invites = this.invites.get(inviteeId);
		const invite = invites?.get(`${inviterId}:${tableId}`);
		invites?.delete(`${inviterId}:${tableId}`);
		return invite !== undefined && invite.expiresAt > now;
	}

	async pending(
		inviteeId: string,
		now: Date,
	): Promise<readonly PendingInvite[]> {
		return [...(this.invites.get(inviteeId)?.values() ?? [])]
			.filter(({ expiresAt }) => expiresAt > now)
			.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
	}
}
