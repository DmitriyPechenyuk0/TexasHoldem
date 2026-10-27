import { InMemoryObjectStorage } from "../../../../../../test/support/in-memory-object-storage.js";
import { createProfile } from "../../../domain/profile.js";
import { InMemoryProfiles } from "../in-memory-profiles.js";
import { RemoveAvatarCommand } from "./remove-avatar.command.js";
import { RemoveAvatarHandler } from "./remove-avatar.handler.js";

const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
const avatarKey = `avatars/${userId}/a.webp`;

function setUp(withAvatar: boolean) {
	const profiles = new InMemoryProfiles({
		...createProfile({
			userId,
			username: "alice",
			locale: "en",
			now: new Date(),
		}),
		avatarKey: withAvatar ? avatarKey : null,
	});
	const storage = new InMemoryObjectStorage();
	storage.objects.set(avatarKey, { body: new Uint8Array([1]) });
	return {
		profiles,
		storage,
		handler: new RemoveAvatarHandler(profiles, storage),
	};
}

describe("RemoveAvatarHandler", () => {
	it("clears the avatar and deletes its object", async () => {
		const { profiles, storage, handler } = setUp(true);

		await handler.execute(new RemoveAvatarCommand(userId));

		expect(profiles.rows.get(userId)?.avatarKey).toBeNull();
		expect(storage.objects.size).toBe(0);
	});

	it("deletes nothing when there is no avatar", async () => {
		const { storage, handler } = setUp(false);

		await handler.execute(new RemoveAvatarCommand(userId));

		expect(storage.objects.size).toBe(1);
	});

	it("succeeds when storage cannot delete the object", async () => {
		const { profiles, storage, handler } = setUp(true);
		storage.failDeletes = true;

		await handler.execute(new RemoveAvatarCommand(userId));

		expect(profiles.rows.get(userId)?.avatarKey).toBeNull();
	});

	it("throws profile.not-found without a profile", async () => {
		await expect(
			new RemoveAvatarHandler(
				new InMemoryProfiles(),
				new InMemoryObjectStorage(),
			).execute(new RemoveAvatarCommand(userId)),
		).rejects.toMatchObject({ code: "profile.not-found" });
	});
});
