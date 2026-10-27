import type { ChangePasswordRequest } from "@holdem/shared/contracts/identity";
import {
	type AvatarContentType,
	AvatarUploadResponse,
	MyProfileResponse,
} from "@holdem/shared/contracts/profile";
import type { Locale } from "@holdem/shared";
import { z } from "zod";
import type { HttpClient } from "@/shared/api";

export const updateNickname = (client: HttpClient, nickname: string) =>
	client.request("/profile/nickname", {
		method: "PUT",
		body: { nickname },
		schema: MyProfileResponse,
	});

/** The language of the interface and of the player's emails. */
export const updateLocale = (client: HttpClient, locale: Locale) =>
	client.request("/profile/locale", {
		method: "PUT",
		body: { locale },
		schema: MyProfileResponse,
	});

export const requestAvatarUpload = (
	client: HttpClient,
	contentType: AvatarContentType,
) =>
	client.request("/profile/avatar/upload", {
		method: "POST",
		body: { contentType },
		schema: AvatarUploadResponse,
	});

/** Makes the uploaded file the avatar; the api checks the file itself. */
export const confirmAvatar = (client: HttpClient, key: string) =>
	client.request("/profile/avatar", {
		method: "PUT",
		body: { key },
		schema: MyProfileResponse,
	});

export const removeAvatar = (client: HttpClient) =>
	client.request("/profile/avatar", {
		method: "DELETE",
		schema: MyProfileResponse,
	});

/** Storage refused the file, or could not be reached; `code` is what the page translates. */
export class StorageUploadError extends Error {
	readonly code = "upload.failed";

	constructor(readonly status: number) {
		super(`storage answered the upload with ${status}`);
		this.name = "StorageUploadError";
	}
}

/**
 * Posts the file straight to storage with the presigned fields. XMLHttpRequest rather than fetch,
 * which cannot report upload progress: `onProgress` gets 0–1.
 */
export function uploadToStorage(
	{ url, fields }: AvatarUploadResponse,
	file: Blob,
	onProgress: (fraction: number) => void,
): Promise<void> {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		form.append(name, value);
	}
	// The file goes last: storage reads every field before it.
	form.append("file", file);
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) {
				onProgress(event.loaded / event.total);
			}
		});
		request.addEventListener("load", () =>
			request.status >= 200 && request.status < 300
				? resolve()
				: reject(new StorageUploadError(request.status)),
		);
		request.addEventListener("error", () => reject(new StorageUploadError(0)));
		request.open("POST", url);
		request.send(form);
	});
}

const ChangePasswordResponse = z.object({ token: z.string().nullable() });

/** Every other session ends; this browser gets a new one. */
export async function changePassword(
	client: HttpClient,
	body: ChangePasswordRequest,
): Promise<void> {
	await client.request("/auth/change-password", {
		method: "POST",
		body,
		schema: ChangePasswordResponse,
	});
}
