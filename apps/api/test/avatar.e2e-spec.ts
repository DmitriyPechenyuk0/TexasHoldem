import {
	AvatarUploadResponse,
	MyProfileResponse,
} from "@holdem/shared/contracts/profile";
import type { INestApplication } from "@nestjs/common";
import sharp from "sharp";
import type { App } from "supertest/types.js";
import { AVATAR_UPLOAD_RULE } from "@/modules/profile/presentation/profile.controller.js";
import { ObjectStorage } from "@/shared/application/object-storage.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import {
	type Browser,
	browser,
	problemOf,
	signUpAndVerify,
} from "./support/identity.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

const MB = 1024 * 1024;

/** A broken POST policy condition: AWS answers 403 AccessDenied, RustFS 400. */
const REFUSED_BY_POLICY = [400, 403];

const picture = (format: "png" | "jpeg" | "webp", width = 640, height = 480) =>
	sharp({
		create: { width, height, channels: 3, background: "#007a55" },
	})
		[format]()
		.toBuffer();

/** What the browser does with a presigned upload: a multipart POST of its fields, then the file. */
async function postToStorage(
	upload: AvatarUploadResponse,
	body: Uint8Array,
	fields: Record<string, string> = upload.fields,
): Promise<number> {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		form.append(name, value);
	}
	form.append("file", new Blob([Buffer.from(body)]));
	const response = await fetch(upload.url, { method: "POST", body: form });
	return response.status;
}

describe("Avatar upload (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let storage: ObjectStorage;

	beforeAll(async () => {
		database = await createTestDatabase();
		app = await createTestApp({
			config: { database: { url: database.url }, trustProxy: "loopback" },
		});
		storage = app.get(ObjectStorage);
	});

	afterAll(async () => {
		await app?.close();
		await database?.drop();
	});

	async function player(): Promise<{ client: Browser; username: string }> {
		const client = browser(app);
		const account = await signUpAndVerify(client);
		return { client, username: account.username.toLowerCase() };
	}

	const requestUpload = async (client: Browser, contentType = "image/png") =>
		AvatarUploadResponse.parse(
			(
				await client
					.post("/api/profile/avatar/upload", { contentType })
					.expect(200)
			).body,
		);

	async function uploadAvatar(
		client: Browser,
		format: "png" | "jpeg" | "webp" = "png",
	) {
		const upload = await requestUpload(client, `image/${format}`);
		expect(await postToStorage(upload, await picture(format))).toBe(204);
		const confirmed = await client
			.put("/api/profile/avatar", { key: upload.key })
			.expect(200);
		return { upload, profile: MyProfileResponse.parse(confirmed.body) };
	}

	it("stores an upload as a public 256×256 WebP and removes the upload", async () => {
		const { client, username } = await player();

		const { upload, profile } = await uploadAvatar(client, "jpeg");

		expect(upload.maxBytes).toBe(2 * MB);
		expect(profile.avatarUrl).toMatch(
			new RegExp(
				`^${exampleConfig().s3.publicUrl}/avatars/${profile.userId}/[0-9a-f-]{36}\\.webp$`,
			),
		);
		// Anyone may read it, without credentials.
		const served = await fetch(profile.avatarUrl!);
		expect(served.status).toBe(200);
		expect(served.headers.get("content-type")).toBe("image/webp");
		expect(served.headers.get("cache-control")).toContain("immutable");
		expect(
			await sharp(Buffer.from(await served.arrayBuffer())).metadata(),
		).toMatchObject({ format: "webp", width: 256, height: 256 });
		expect(await storage.stat(upload.key)).toBeNull();
		const publicProfile = await browser(app)
			.get(`/api/profiles/${username}`)
			.expect(200);
		expect(publicProfile.body.avatarUrl).toBe(profile.avatarUrl);
	});

	it("deletes the old avatar when a new one replaces it", async () => {
		const { client } = await player();
		const first = await uploadAvatar(client, "png");

		const second = await uploadAvatar(client, "webp");

		expect(second.profile.avatarUrl).not.toBe(first.profile.avatarUrl);
		const oldKey = new URL(first.profile.avatarUrl!).pathname.replace(
			`/${exampleConfig().s3.bucket}/`,
			"",
		);
		expect(await storage.stat(oldKey)).toBeNull();
	});

	it("keeps pending uploads private", async () => {
		const { client } = await player();
		const upload = await requestUpload(client);
		expect(await postToStorage(upload, await picture("png"))).toBe(204);

		const direct = await fetch(`${exampleConfig().s3.publicUrl}/${upload.key}`);

		expect(direct.status).toBe(403);
	});

	describe("storage refuses what the presigned upload does not allow", () => {
		it("a file over 2 MB", async () => {
			const { client } = await player();
			const upload = await requestUpload(client);

			const status = await postToStorage(upload, new Uint8Array(2 * MB + 1));

			expect(status).toBe(400);
			expect(await storage.stat(upload.key)).toBeNull();
		});

		it("another content type than the one signed", async () => {
			const { client } = await player();
			const upload = await requestUpload(client, "image/png");

			const status = await postToStorage(upload, await picture("png"), {
				...upload.fields,
				"Content-Type": "text/html",
			});

			expect(REFUSED_BY_POLICY).toContain(status);
			expect(await storage.stat(upload.key)).toBeNull();
		});

		it("another key than the one signed", async () => {
			const { client } = await player();
			const upload = await requestUpload(client);

			const status = await postToStorage(upload, await picture("png"), {
				...upload.fields,
				key: "avatars/someone-else/x.webp",
			});

			expect(REFUSED_BY_POLICY).toContain(status);
			expect(await storage.stat("avatars/someone-else/x.webp")).toBeNull();
		});
	});

	it.each(["image/gif", "image/svg+xml", "text/html"])(
		"never presigns a %s upload",
		async (contentType) => {
			const { client } = await player();

			const refused = await client
				.post("/api/profile/avatar/upload", { contentType })
				.expect(400);

			expect(problemOf(refused).code).toBe("request.invalid");
		},
	);

	it("refuses a page uploaded as a PNG at confirmation, and deletes it", async () => {
		const { client } = await player();
		const upload = await requestUpload(client, "image/png");
		expect(
			await postToStorage(
				upload,
				new TextEncoder().encode("<html><script>alert(1)</script></html>"),
			),
		).toBe(204);

		const refused = await client
			.put("/api/profile/avatar", { key: upload.key })
			.expect(422);

		expect(problemOf(refused).code).toBe("profile.avatar-invalid-image");
		expect(await storage.stat(upload.key)).toBeNull();
		expect(
			(await client.get("/api/profile").expect(200)).body.avatarUrl,
		).toBeNull();
	});

	it("refuses to confirm another player's upload", async () => {
		const owner = await player();
		const upload = await requestUpload(owner.client);
		expect(await postToStorage(upload, await picture("png"))).toBe(204);
		const { client: thief } = await player();

		const refused = await thief
			.put("/api/profile/avatar", { key: upload.key })
			.expect(404);

		expect(problemOf(refused).code).toBe("profile.avatar-upload-not-found");
		expect(await storage.stat(upload.key)).not.toBeNull();
	});

	it("answers an upload that never arrived with avatar-upload-not-found", async () => {
		const { client } = await player();
		const upload = await requestUpload(client);

		const refused = await client
			.put("/api/profile/avatar", { key: upload.key })
			.expect(404);

		expect(problemOf(refused).code).toBe("profile.avatar-upload-not-found");
	});

	it("removes the avatar and its object", async () => {
		const { client } = await player();
		const { profile } = await uploadAvatar(client);

		const removed = await client.delete("/api/profile/avatar").expect(200);

		expect(MyProfileResponse.parse(removed.body).avatarUrl).toBeNull();
		expect((await fetch(profile.avatarUrl!)).status).not.toBe(200);
	});

	it("limits upload requests per player, with Retry-After", async () => {
		const { client } = await player();
		for (let request = 0; request < AVATAR_UPLOAD_RULE.max; request++) {
			await requestUpload(client);
		}

		const refused = await client
			.post("/api/profile/avatar/upload", { contentType: "image/png" })
			.expect(429);

		expect(problemOf(refused).code).toBe("request.rate-limited");
		expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
	});

	it("needs a session", async () => {
		const anonymous = browser(app);

		await anonymous
			.post("/api/profile/avatar/upload", { contentType: "image/png" })
			.expect(401);
		await anonymous.put("/api/profile/avatar", { key: "x" }).expect(401);
		await anonymous.delete("/api/profile/avatar").expect(401);
	});
});
