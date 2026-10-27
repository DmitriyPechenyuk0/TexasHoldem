import {
	ObjectStorage,
	type PresignedUpload,
	type StoredObject,
	type UploadPolicy,
} from "@/shared/application/object-storage.js";

/** Storage for handler tests: objects in a map; `failDeletes` makes every delete throw. */
export class InMemoryObjectStorage extends ObjectStorage {
	readonly objects = new Map<
		string,
		{
			readonly body: Uint8Array;
			readonly contentType?: string;
			readonly cacheControl?: string;
		}
	>();
	readonly policies: UploadPolicy[] = [];
	failDeletes = false;

	async presignUpload(policy: UploadPolicy): Promise<PresignedUpload> {
		this.policies.push(policy);
		return {
			url: "https://storage.test/avatars",
			fields: { key: policy.key, "Content-Type": policy.contentType },
		};
	}

	async stat(key: string): Promise<StoredObject | null> {
		const object = this.objects.get(key);
		return object ? { size: object.body.byteLength } : null;
	}

	async read(key: string): Promise<Uint8Array | null> {
		return this.objects.get(key)?.body ?? null;
	}

	async write(
		key: string,
		body: Uint8Array,
		options: { readonly contentType: string; readonly cacheControl?: string },
	): Promise<void> {
		this.objects.set(key, { body, ...options });
	}

	async delete(key: string): Promise<void> {
		if (this.failDeletes) {
			throw new Error("storage unavailable");
		}
		this.objects.delete(key);
	}

	publicUrl(key: string): string {
		return `https://cdn.test/${key}`;
	}
}
