import { InMemoryObjectStorage } from "../../../../../../test/support/in-memory-object-storage.js";
import { AVATAR_MAX_BYTES, uploadKey } from "../../../domain/avatar.js";
import { createProfile } from "../../../domain/profile.js";
import { AvatarImages } from "../../avatar-images.js";
import { InMemoryProfiles } from "../in-memory-profiles.js";
import { ConfirmAvatarUploadCommand } from "./confirm-avatar-upload.command.js";
import {
	AVATAR_CACHE_CONTROL,
	ConfirmAvatarUploadHandler,
} from "./confirm-avatar-upload.handler.js";

const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
const key = uploadKey(userId, "5d1f2c3b-9a8e-4f7d-8c6b-1a2b3c4d5e6f");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const ENCODED = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

/** Encodes anything to ENCODED, or decodes nothing at all. */
class FakeImages extends AvatarImages {
	readonly received: Uint8Array[] = [];

	constructor(private readonly decodes = true) {
		super();
	}

	async toAvatar(image: Uint8Array): Promise<Uint8Array | null> {
		this.received.push(image);
		return this.decodes ? ENCODED : null;
	}
}

function setUp({
	avatarKey = null as string | null,
	upload = PNG as Uint8Array | null,
	decodes = true,
} = {}) {
	const profile = {
		...createProfile({
			userId,
			username: "alice",
			locale: "en",
			now: new Date(),
		}),
		avatarKey,
	};
	const profiles = new InMemoryProfiles(profile);
	const storage = new InMemoryObjectStorage();
	if (avatarKey) {
		storage.objects.set(avatarKey, { body: ENCODED });
	}
	if (upload) {
		storage.objects.set(key, { body: upload });
	}
	const images = new FakeImages(decodes);
	const handler = new ConfirmAvatarUploadHandler(profiles, storage, images);
	return { handler, profiles, storage, images };
}

describe("ConfirmAvatarUploadHandler", () => {
	it("stores the re-encoded picture as the avatar, then deletes the upload and the old avatar", async () => {
		const { handler, profiles, storage } = setUp({
			avatarKey: `avatars/${userId}/old.webp`,
		});

		await handler.execute(new ConfirmAvatarUploadCommand(userId, key));

		const avatarKey = profiles.rows.get(userId)?.avatarKey;
		expect(avatarKey).toMatch(
			new RegExp(`^avatars/${userId}/[0-9a-f-]{36}\\.webp$`),
		);
		expect(storage.objects.get(avatarKey!)).toEqual({
			body: ENCODED,
			contentType: "image/webp",
			cacheControl: AVATAR_CACHE_CONTROL,
		});
		expect([...storage.objects.keys()]).toEqual([avatarKey]);
	});

	it("refuses another player's upload and leaves it alone", async () => {
		const { handler, storage } = setUp();

		await expect(
			handler.execute(
				new ConfirmAvatarUploadCommand(
					"5d1f2c3b-0000-4f7d-8c6b-1a2b3c4d5e6f",
					key,
				),
			),
		).rejects.toMatchObject({ code: "profile.avatar-upload-not-found" });
		expect(storage.objects.has(key)).toBe(true);
	});

	it("answers an upload that never arrived with avatar-upload-not-found", async () => {
		const { handler } = setUp({ upload: null });

		await expect(
			handler.execute(new ConfirmAvatarUploadCommand(userId, key)),
		).rejects.toMatchObject({ code: "profile.avatar-upload-not-found" });
	});

	it.each([
		[
			"too large",
			new Uint8Array(AVATAR_MAX_BYTES + 1).fill(0x89, 0, 1),
			true,
			"profile.avatar-too-large",
		],
		[
			"not an image, whatever its content type said",
			new TextEncoder().encode("<html><script>alert(1)</script>"),
			true,
			"profile.avatar-invalid-image",
		],
		[
			"an image signature with a body that does not decode",
			PNG,
			false,
			"profile.avatar-invalid-image",
		],
	])(
		"refuses an upload that is %s, deletes it and keeps the avatar",
		async (_case, upload, decodes, code) => {
			const { handler, profiles, storage } = setUp({
				upload,
				decodes,
				avatarKey: `avatars/${userId}/old.webp`,
			});

			await expect(
				handler.execute(new ConfirmAvatarUploadCommand(userId, key)),
			).rejects.toMatchObject({ code });
			expect(storage.objects.has(key)).toBe(false);
			expect(profiles.rows.get(userId)?.avatarKey).toBe(
				`avatars/${userId}/old.webp`,
			);
			expect([...storage.objects.keys()]).toEqual([
				`avatars/${userId}/old.webp`,
			]);
		},
	);

	it("never decodes what does not start like an image", async () => {
		const { handler, images } = setUp({
			upload: new TextEncoder().encode("GIF89a"),
		});

		await expect(
			handler.execute(new ConfirmAvatarUploadCommand(userId, key)),
		).rejects.toMatchObject({ code: "profile.avatar-invalid-image" });
		expect(images.received).toEqual([]);
	});

	it("succeeds when storage cannot delete the leftovers", async () => {
		const { handler, profiles, storage } = setUp({
			avatarKey: `avatars/${userId}/old.webp`,
		});
		storage.failDeletes = true;

		await handler.execute(new ConfirmAvatarUploadCommand(userId, key));

		expect(profiles.rows.get(userId)?.avatarKey).not.toBe(
			`avatars/${userId}/old.webp`,
		);
	});

	it("throws profile.not-found without a profile", async () => {
		const storage = new InMemoryObjectStorage();
		const handler = new ConfirmAvatarUploadHandler(
			new InMemoryProfiles(),
			storage,
			new FakeImages(),
		);

		await expect(
			handler.execute(new ConfirmAvatarUploadCommand(userId, key)),
		).rejects.toMatchObject({ code: "profile.not-found" });
	});

	it.each([
		[
			"is gone between the size check and the read",
			async () => null,
			"profile.avatar-upload-not-found",
		],
		[
			"grew past the limit between the size check and the read",
			async () => new Uint8Array(AVATAR_MAX_BYTES + 1),
			"profile.avatar-too-large",
		],
	])("refuses an upload that %s", async (_case, read, code) => {
		const { profiles, images } = setUp();
		const storage = new (class extends InMemoryObjectStorage {
			override read = read;
		})();
		storage.objects.set(key, { body: PNG });
		const handler = new ConfirmAvatarUploadHandler(profiles, storage, images);

		await expect(
			handler.execute(new ConfirmAvatarUploadCommand(userId, key)),
		).rejects.toMatchObject({ code });
	});
});
