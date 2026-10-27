/** A browser upload straight to storage: a multipart POST of `fields`, then the file, to `url`. */
export interface PresignedUpload {
	readonly url: string;
	readonly fields: Readonly<Record<string, string>>;
}

/** What storage accepts for one presigned upload; anything else it refuses itself. */
export interface UploadPolicy {
	readonly key: string;
	readonly contentType: string;
	readonly maxBytes: number;
	readonly expiresInSeconds: number;
}

export interface StoredObject {
	readonly size: number;
}

/**
 * Port for the object storage behind avatars (S3-compatible). Keys are paths in the one bucket;
 * objects under a public prefix are readable by anyone at `publicUrl(key)`.
 */
export abstract class ObjectStorage {
	abstract presignUpload(policy: UploadPolicy): Promise<PresignedUpload>;

	/** Size of the object, or null when there is none. */
	abstract stat(key: string): Promise<StoredObject | null>;

	/** The whole object, or null when there is none. */
	abstract read(key: string): Promise<Uint8Array | null>;

	abstract write(
		key: string,
		body: Uint8Array,
		options: { readonly contentType: string; readonly cacheControl?: string },
	): Promise<void>;

	/** Succeeds when the object is already gone. */
	abstract delete(key: string): Promise<void>;

	abstract publicUrl(key: string): string;
}
