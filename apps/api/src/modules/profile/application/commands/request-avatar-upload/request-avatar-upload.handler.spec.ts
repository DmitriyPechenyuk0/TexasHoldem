import {
	AVATAR_CONTENT_TYPES as CONTRACT_CONTENT_TYPES,
	AVATAR_MAX_BYTES as CONTRACT_MAX_BYTES,
} from "@holdem/shared/contracts/profile";
import { InMemoryObjectStorage } from "../../../../../../test/support/in-memory-object-storage.js";
import {
	AVATAR_CONTENT_TYPES,
	AVATAR_MAX_BYTES,
	isUploadOf,
} from "../../../domain/avatar.js";
import { RequestAvatarUploadCommand } from "./request-avatar-upload.command.js";
import {
	AVATAR_UPLOAD_EXPIRES_IN_SECONDS,
	RequestAvatarUploadHandler,
} from "./request-avatar-upload.handler.js";

const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";

describe("RequestAvatarUploadHandler", () => {
	it("presigns one upload of that type and size under the player's upload prefix", async () => {
		const storage = new InMemoryObjectStorage();

		const upload = await new RequestAvatarUploadHandler(storage).execute(
			new RequestAvatarUploadCommand(userId, "image/webp"),
		);

		expect(isUploadOf(userId, upload.key)).toBe(true);
		expect(upload).toMatchObject({
			url: "https://storage.test/avatars",
			maxBytes: AVATAR_MAX_BYTES,
		});
		expect(storage.policies).toEqual([
			{
				key: upload.key,
				contentType: "image/webp",
				maxBytes: AVATAR_MAX_BYTES,
				expiresInSeconds: AVATAR_UPLOAD_EXPIRES_IN_SECONDS,
			},
		]);
	});

	it("gives every upload its own key", async () => {
		const handler = new RequestAvatarUploadHandler(new InMemoryObjectStorage());
		const command = new RequestAvatarUploadCommand(userId, "image/png");

		const [first, second] = await Promise.all([
			handler.execute(command),
			handler.execute(command),
		]);

		expect(first.key).not.toBe(second.key);
	});

	it("keeps the domain's limits in line with the shared contract", () => {
		expect(AVATAR_MAX_BYTES).toBe(CONTRACT_MAX_BYTES);
		expect(AVATAR_CONTENT_TYPES).toEqual(CONTRACT_CONTENT_TYPES);
	});
});
