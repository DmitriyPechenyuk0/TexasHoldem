/** Port: turns an uploaded picture into the avatar the app serves. */
export abstract class AvatarImages {
	/**
	 * A square WebP of the picture, without its metadata (camera, location); null when it cannot be
	 * decoded as an image, or is too large to decode safely.
	 */
	abstract toAvatar(image: Uint8Array): Promise<Uint8Array | null>;
}
