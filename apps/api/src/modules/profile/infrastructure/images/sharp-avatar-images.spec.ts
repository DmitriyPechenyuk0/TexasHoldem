import sharp from "sharp";
import { AVATAR_SIDE, encodeAvatar, Semaphore } from "./sharp-avatar-images.js";

const picture = (
	width: number,
	height: number,
	format: "png" | "jpeg" | "webp" = "png",
) =>
	sharp({
		create: { width, height, channels: 3, background: "#007a55" },
	})
		[format]()
		.toBuffer();

describe("encodeAvatar", () => {
	it.each(["png", "jpeg", "webp"] as const)(
		"turns a %s of any shape into a square WebP",
		async (format) => {
			const avatar = await encodeAvatar(await picture(640, 360, format));

			expect(await sharp(avatar!).metadata()).toMatchObject({
				format: "webp",
				width: AVATAR_SIDE,
				height: AVATAR_SIDE,
			});
		},
	);

	it("drops the metadata, such as where a photo was taken", async () => {
		const photo = await sharp(await picture(400, 400, "jpeg"))
			.withExif({
				IFD0: { Copyright: "Ada", ImageDescription: "52.52N 13.40E" },
			})
			.toBuffer();
		expect((await sharp(photo).metadata()).exif).toBeDefined();

		const avatar = await encodeAvatar(photo);

		const metadata = await sharp(avatar!).metadata();
		expect(metadata.exif).toBeUndefined();
		expect(metadata.icc).toBeUndefined();
	});

	it("follows the EXIF orientation, so a phone photo is not sideways", async () => {
		// Stored 300×100, red on the left and blue on the right; orientation 6 shows it turned a
		// quarter clockwise: tall, red on top.
		const width = 300;
		const height = 100;
		const pixels = Buffer.alloc(width * height * 3);
		for (let index = 0; index < width * height; index++) {
			pixels[index * 3 + (index % width < width / 2 ? 0 : 2)] = 255;
		}
		const photo = await sharp(pixels, { raw: { width, height, channels: 3 } })
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer();

		const avatar = await encodeAvatar(photo);

		const { data } = await sharp(avatar!)
			.raw()
			.toBuffer({ resolveWithObject: true });
		const at = (x: number, y: number) => {
			const offset = (y * AVATAR_SIDE + x) * 3;
			return data[offset]! > data[offset + 2]! ? "red" : "blue";
		};
		const middle = AVATAR_SIDE / 2;
		expect([at(middle, 10), at(middle, AVATAR_SIDE - 10)]).toEqual([
			"red",
			"blue",
		]);
	});

	it.each([
		[
			"text posing as an image",
			async () => Buffer.from("<script>alert(1)</script>"),
			undefined,
		],
		[
			"a truncated PNG",
			async () => (await picture(200, 200)).subarray(0, 120),
			undefined,
		],
		["more pixels than allowed", () => picture(20, 20), 100],
	])("refuses %s", async (_case, body, maxPixels) => {
		expect(await encodeAvatar(await body(), maxPixels)).toBeNull();
	});
});

describe("Semaphore", () => {
	it("runs at most `limit` tasks at once, the rest in order, and frees slots on failure", async () => {
		const semaphore = new Semaphore(2);
		let running = 0;
		let peak = 0;
		const finished: number[] = [];
		const task = (id: number, fail = false) =>
			semaphore.run(async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise((resolve) => setTimeout(resolve, 5));
				running--;
				if (fail) {
					throw new Error(`task ${id}`);
				}
				finished.push(id);
				return id;
			});

		const results = await Promise.allSettled([
			task(1, true),
			task(2),
			task(3),
			task(4),
			task(5),
		]);

		expect(peak).toBe(2);
		expect(results.map((result) => result.status)).toEqual([
			"rejected",
			"fulfilled",
			"fulfilled",
			"fulfilled",
			"fulfilled",
		]);
		expect(finished).toEqual([2, 3, 4, 5]);
		// Every slot came back: the next task starts at once.
		expect(await task(6)).toBe(6);
	});
});
