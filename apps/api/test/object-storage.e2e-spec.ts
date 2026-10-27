import type { INestApplication } from "@nestjs/common";
import type { App } from "supertest/types.js";
import { randomUUID } from "node:crypto";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";

// The S3 adapter against the local S3 service (RustFS), as the avatar flow uses it.
describe("ObjectStorage on S3 (e2e)", () => {
	let app: INestApplication<App>;
	let storage: ObjectStorage;
	const key = () => `uploads/storage-test/${randomUUID()}`;

	beforeAll(async () => {
		app = await createTestApp();
		storage = app.get(ObjectStorage);
	});

	afterAll(async () => {
		await app?.close();
	});

	it("writes, reads, sizes and deletes an object", async () => {
		const at = key();
		const body = new TextEncoder().encode("hello, storage");

		await storage.write(at, body, { contentType: "text/plain" });

		expect(await storage.stat(at)).toEqual({ size: body.byteLength });
		expect(await storage.read(at)).toEqual(body);
		await storage.delete(at);
		expect(await storage.stat(at)).toBeNull();
	});

	it("answers a missing object with null, and deletes it without complaint", async () => {
		const at = key();

		expect(await storage.stat(at)).toBeNull();
		expect(await storage.read(at)).toBeNull();
		await expect(storage.delete(at)).resolves.toBeUndefined();
	});

	it("builds public URLs under S3_PUBLIC_URL with each segment encoded", () => {
		expect(storage.publicUrl("avatars/a b/c#d.webp")).toBe(
			`${exampleConfig().s3.publicUrl}/avatars/a%20b/c%23d.webp`,
		);
	});

	it("throws, rather than answering null, when storage cannot be reached", async () => {
		const unreachable = await createTestApp({
			config: {
				// Nothing listens there: every connection is refused at once.
				s3: { ...exampleConfig().s3, endpoint: "http://127.0.0.1:1" },
			},
		});
		try {
			const offline = unreachable.get(ObjectStorage);

			await expect(offline.stat(key())).rejects.toThrow();
			await expect(offline.read(key())).rejects.toThrow();
		} finally {
			await unreachable.close();
		}
	});
});
