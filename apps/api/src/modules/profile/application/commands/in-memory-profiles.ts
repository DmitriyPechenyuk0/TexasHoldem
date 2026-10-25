import type { Profile } from "../../domain/profile.js";
import { ProfileRepository } from "../../domain/profile.repository.js";

/** The repository for handler tests: profiles in a map, by user id. */
export class InMemoryProfiles extends ProfileRepository {
	readonly rows = new Map<string, Profile>();

	constructor(...profiles: Profile[]) {
		super();
		for (const profile of profiles) {
			this.rows.set(profile.userId, profile);
		}
	}

	async findByUserId(userId: string): Promise<Profile | null> {
		return this.rows.get(userId) ?? null;
	}

	async add(profile: Profile): Promise<boolean> {
		if (this.rows.has(profile.userId)) {
			return false;
		}
		this.rows.set(profile.userId, profile);
		return true;
	}

	async save(profile: Profile): Promise<void> {
		this.rows.set(profile.userId, profile);
	}
}
