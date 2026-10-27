import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import {
	AVATAR_MAX_BYTES,
	AvatarTooLargeError,
	AvatarUploadNotFoundError,
	avatarKey,
	InvalidAvatarError,
	isUploadOf,
	sniffImageType,
} from "../../../domain/avatar.js";
import { changeAvatar } from "../../../domain/profile.js";
import { ProfileNotFoundError } from "../../../domain/profile-not-found.error.js";
import { ProfileRepository } from "../../../domain/profile.repository.js";
import { AvatarImages } from "../../avatar-images.js";
import { ConfirmAvatarUploadCommand } from "./confirm-avatar-upload.command.js";

/** A confirmed avatar never changes under its key, so browsers and CDNs may keep it for good. */
export const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Checks the upload whatever the browser claimed: its size, its first bytes, and that it decodes.
 * It is re-encoded as a 256×256 WebP, which also drops its metadata and anything hidden after the
 * image. The upload is deleted in every case, and the replaced avatar once the profile is saved.
 */
@CommandHandler(ConfirmAvatarUploadCommand)
export class ConfirmAvatarUploadHandler implements ICommandHandler<ConfirmAvatarUploadCommand> {
	private readonly logger = new Logger(ConfirmAvatarUploadHandler.name);

	constructor(
		private readonly profiles: ProfileRepository,
		private readonly storage: ObjectStorage,
		private readonly images: AvatarImages,
	) {}

	async execute({ userId, key }: ConfirmAvatarUploadCommand): Promise<void> {
		if (!isUploadOf(userId, key)) {
			throw new AvatarUploadNotFoundError();
		}
		const profile = await this.profiles.findByUserId(userId);
		if (!profile) {
			throw new ProfileNotFoundError();
		}
		try {
			const avatar = await this.avatarFrom(key);
			const newKey = avatarKey(userId, randomUUID());
			await this.storage.write(newKey, avatar, {
				contentType: "image/webp",
				cacheControl: AVATAR_CACHE_CONTROL,
			});
			const changed = changeAvatar(profile, newKey);
			await this.profiles.save(changed.profile);
			if (changed.replacedKey) {
				await this.deleteQuietly(changed.replacedKey);
			}
		} finally {
			await this.deleteQuietly(key);
		}
	}

	private async avatarFrom(key: string): Promise<Uint8Array> {
		const stored = await this.storage.stat(key);
		if (!stored) {
			throw new AvatarUploadNotFoundError();
		}
		// Storage enforces the limit on upload; this holds even if it did not.
		if (stored.size > AVATAR_MAX_BYTES) {
			throw new AvatarTooLargeError();
		}
		const upload = await this.storage.read(key);
		if (!upload) {
			throw new AvatarUploadNotFoundError();
		}
		if (upload.byteLength > AVATAR_MAX_BYTES) {
			throw new AvatarTooLargeError();
		}
		const avatar = sniffImageType(upload)
			? await this.images.toAvatar(upload)
			: null;
		if (!avatar) {
			throw new InvalidAvatarError();
		}
		return avatar;
	}

	/** A leftover object costs storage, not correctness; the bucket expires stale uploads. */
	private async deleteQuietly(key: string): Promise<void> {
		try {
			await this.storage.delete(key);
		} catch (error) {
			this.logger.warn({
				msg: "avatar object not deleted",
				key,
				error: String(error),
			});
		}
	}
}
