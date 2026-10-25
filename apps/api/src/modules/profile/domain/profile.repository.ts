import type { Profile } from "./profile.js";

export abstract class ProfileRepository {
	abstract findByUserId(userId: string): Promise<Profile | null>;

	/** Stores a new profile; false when the user already has one (events may be delivered twice). */
	abstract add(profile: Profile): Promise<boolean>;

	abstract save(profile: Profile): Promise<void>;
}
