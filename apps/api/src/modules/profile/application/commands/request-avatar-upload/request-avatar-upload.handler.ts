import { randomUUID } from "node:crypto";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import { AVATAR_MAX_BYTES, uploadKey } from "../../../domain/avatar.js";
import {
	type AvatarUpload,
	RequestAvatarUploadCommand,
} from "./request-avatar-upload.command.js";

/** Long enough to pick a file on a slow connection; a stale form just asks again. */
export const AVATAR_UPLOAD_EXPIRES_IN_SECONDS = 5 * 60;

@CommandHandler(RequestAvatarUploadCommand)
export class RequestAvatarUploadHandler implements ICommandHandler<RequestAvatarUploadCommand> {
	constructor(private readonly storage: ObjectStorage) {}

	async execute({
		userId,
		contentType,
	}: RequestAvatarUploadCommand): Promise<AvatarUpload> {
		const key = uploadKey(userId, randomUUID());
		const upload = await this.storage.presignUpload({
			key,
			contentType,
			maxBytes: AVATAR_MAX_BYTES,
			expiresInSeconds: AVATAR_UPLOAD_EXPIRES_IN_SECONDS,
		});
		return { ...upload, key, maxBytes: AVATAR_MAX_BYTES };
	}
}
