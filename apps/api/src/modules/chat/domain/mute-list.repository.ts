/** Whom each player muted. Muting twice, or unmuting someone not muted, changes nothing. */
export abstract class MuteListRepository {
	abstract mute(userId: string, mutedId: string, at: Date): Promise<void>;

	abstract unmute(userId: string, mutedId: string): Promise<void>;

	/** Whom the player muted, latest first. */
	abstract mutedBy(
		userId: string,
	): Promise<readonly { readonly mutedId: string; readonly mutedAt: Date }[]>;
}
