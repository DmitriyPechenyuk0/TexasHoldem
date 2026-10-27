import { isUploadOf, sniffImageType, uploadKey } from "./avatar.js";

const bytes = (...values: (number | string)[]) =>
	new Uint8Array(
		values.flatMap((value) =>
			typeof value === "string"
				? Array.from(value, (char) => char.charCodeAt(0))
				: [value],
		),
	);

describe("sniffImageType", () => {
	it.each([
		["PNG", bytes(0x89, "PNG\r\n\x1a\n", 0, 0), "image/png"],
		["JPEG", bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
		["WebP", bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "), "image/webp"],
	])("recognises %s by its signature", (_name, image, type) => {
		expect(sniffImageType(image)).toBe(type);
	});

	it.each([
		["an HTML page", bytes("<!doctype html><script>")],
		["a GIF", bytes("GIF89a")],
		["a RIFF that is not WebP", bytes("RIFF", 0, 0, 0, 0, "WAVEfmt ")],
		["a truncated PNG signature", bytes(0x89, "PN")],
		["nothing", bytes()],
	])("refuses %s", (_name, body) => {
		expect(sniffImageType(body)).toBeNull();
	});
});

describe("isUploadOf", () => {
	const userId = "0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d";
	const id = "5d1f2c3b-9a8e-4f7d-8c6b-1a2b3c4d5e6f";

	it("accepts the player's own upload", () => {
		expect(isUploadOf(userId, uploadKey(userId, id))).toBe(true);
	});

	it.each([
		[
			"another player's upload",
			uploadKey("5d1f2c3b-0000-4f7d-8c6b-1a2b3c4d5e6f", id),
		],
		["a confirmed avatar", `avatars/${userId}/${id}.webp`],
		["a path that climbs out", `uploads/${userId}/../other/${id}`],
		["a key with more after the id", `${uploadKey(userId, id)}/x`],
	])("refuses %s", (_name, key) => {
		expect(isUploadOf(userId, key)).toBe(false);
	});
});
