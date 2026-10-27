/** FNV-1a: a fast, well-spread 32-bit hash; nothing here needs it to be secret. */
function hash(text: string): number {
	let value = 0x811c9dc5;
	for (const char of text) {
		value ^= char.codePointAt(0)!;
		value = Math.imul(value, 0x01000193) >>> 0;
	}
	return value;
}

export interface Identicon {
	/** 0–359, the colour of the filled cells. */
	readonly hue: number;
	/** 5 rows of 5, mirrored left to right, true where a cell is filled. */
	readonly cells: readonly (readonly boolean[])[];
}

export const IDENTICON_SIZE = 5;

/**
 * A small symmetric pattern drawn from `seed`, the same everywhere for the same seed: the avatar
 * of a player who has not uploaded one.
 */
export function identicon(seed: string): Identicon {
	const value = hash(seed);
	const bits = hash(`${seed}:cells`);
	const half = Math.ceil(IDENTICON_SIZE / 2);
	const cells = Array.from({ length: IDENTICON_SIZE }, (_, row) => {
		const left = Array.from(
			{ length: half },
			(_, column) => ((bits >>> (row * half + column)) & 1) === 1,
		);
		return [...left, ...left.slice(0, IDENTICON_SIZE - half).reverse()];
	});
	return { hue: value % 360, cells };
}
