import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { AvatarImages } from "../../application/avatar-images.js";

/** Side of the square avatar, in pixels: sharp on high-density screens at the sizes the app shows. */
export const AVATAR_SIDE = 256;

/**
 * The most pixels decoded from one upload. 2 MB of PNG can declare a huge, nearly empty image
 * that would take gigabytes to decode (a decompression bomb); 40 megapixels covers any camera.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Pictures decoded at once per instance. The largest takes a few hundred MB while it decodes, so
 * many players confirming at the same moment wait their turn instead of exhausting memory.
 */
export const MAX_CONCURRENT_ENCODES = 2;

/** Runs at most `limit` tasks at a time; the others wait in order. */
export class Semaphore {
	private active = 0;
	private readonly waiting: (() => void)[] = [];

	constructor(private readonly limit: number) {}

	async run<T>(task: () => Promise<T>): Promise<T> {
		if (this.active < this.limit) {
			this.active++;
		} else {
			// The finishing task hands its slot over, so `active` stays as it is.
			await new Promise<void>((resolve) => this.waiting.push(resolve));
		}
		try {
			return await task();
		} finally {
			const next = this.waiting.shift();
			if (next) {
				next();
			} else {
				this.active--;
			}
		}
	}
}

/**
 * Re-encodes a picture as the avatar: oriented by its EXIF, cut to the centred square, as WebP.
 * Metadata is not carried over. Null when sharp cannot decode it within the limits.
 */
export async function encodeAvatar(
	image: Uint8Array,
	maxInputPixels = MAX_INPUT_PIXELS,
): Promise<Uint8Array | null> {
	try {
		const avatar = await sharp(image, {
			limitInputPixels: maxInputPixels,
			// A truncated or corrupt file is refused, not half drawn.
			failOn: "error",
		})
			.rotate()
			.resize(AVATAR_SIDE, AVATAR_SIDE, { fit: "cover" })
			.webp({ quality: 82 })
			.toBuffer();
		return new Uint8Array(avatar);
	} catch {
		return null;
	}
}

@Injectable()
export class SharpAvatarImages extends AvatarImages {
	private readonly encodes = new Semaphore(MAX_CONCURRENT_ENCODES);

	toAvatar(image: Uint8Array): Promise<Uint8Array | null> {
		return this.encodes.run(() => encodeAvatar(image));
	}
}
