import { Command } from "@nestjs/cqrs";
import type { AvatarContentType } from "../../../domain/avatar.js";
import type { PresignedUpload } from "@/shared/application/object-storage.js";

export interface AvatarUpload extends PresignedUpload {
	/** What to confirm once the browser has uploaded the file. */
	readonly key: string;
	readonly maxBytes: number;
}

/** A presigned upload of one picture of `contentType`, straight from the browser to storage. */
export class RequestAvatarUploadCommand extends Command<AvatarUpload> {
	constructor(
		readonly userId: string,
		readonly contentType: AvatarContentType,
	) {
		super();
	}
}
