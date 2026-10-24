import type { Card } from "../cards/index.js";
import { fullDeck } from "../cards/index.js";
import { concatBytes, lengthPrefixed, uint32BigEndian, utf8 } from "./bytes.js";
import { hmacSha256 } from "./sha256.js";

// The provably fair shuffle (ADR-008). Every step is specified here so anyone can rebuild a deck
// from the revealed server seed with any HMAC-SHA256 implementation.

const HAND_SEED_LABEL = utf8("holdem/hand-seed/v1");
const DECK_STREAM_LABEL = lengthPrefixed(utf8("holdem/deck-stream/v1"));

/** The shortest seed `shuffleDeck` accepts: 128 bits. */
export const MIN_SEED_BYTES = 16;

/**
 * The seed of one hand's deck:
 * `HMAC-SHA256(key = serverSeed, field("holdem/hand-seed/v1") ‖ field(handId) ‖ field(clientSeed₁) ‖ …)`,
 * where `field(x)` is the UTF-8 bytes of `x` after their length as a 32-bit big-endian number.
 * Client seeds go in the order they were published with the hand. Without any, the server seed
 * and the hand id alone decide the deck.
 */
export const deriveHandSeed = (
	serverSeed: Uint8Array,
	handId: string,
	clientSeeds: readonly string[] = [],
): Uint8Array =>
	hmacSha256(
		serverSeed,
		concatBytes(
			...[HAND_SEED_LABEL, utf8(handId), ...clientSeeds.map(utf8)].map(
				lengthPrefixed,
			),
		),
	);

/**
 * An endless stream of 32-bit numbers from a seed: block `i` is
 * `HMAC-SHA256(key = seed, field("holdem/deck-stream/v1") ‖ i as 32-bit big-endian)`, and each
 * 32-byte block gives eight big-endian numbers in order.
 */
export function createRandomStream(seed: Uint8Array): () => number {
	let block: DataView = new DataView(new ArrayBuffer(0));
	let blockIndex = 0;
	let offset = 0;
	return () => {
		if (offset === block.byteLength) {
			const bytes = hmacSha256(
				seed,
				concatBytes(DECK_STREAM_LABEL, uint32BigEndian(blockIndex++)),
			);
			block = new DataView(bytes.buffer);
			offset = 0;
		}
		const value = block.getUint32(offset);
		offset += 4;
		return value;
	};
}

const UINT32_RANGE = 2 ** 32;

/**
 * A uniform integer in `[0, bound)`. Numbers from the top `2^32 mod bound` values are rejected and
 * drawn again, so no result is more likely than another (no modulo bias).
 */
export function uniformInt(next: () => number, bound: number): number {
	const limit = UINT32_RANGE - (UINT32_RANGE % bound);
	for (;;) {
		const value = next();
		if (value < limit) {
			return value % bound;
		}
	}
}

/**
 * The deck for a seed: Fisher–Yates over the canonical deck (2c 2d … As). For `i` from 51 down
 * to 1, swap position `i` with position `uniformInt(i + 1)`. Cards are dealt from position 0.
 */
export function shuffleDeck(seed: Uint8Array): Card[] {
	if (seed.length < MIN_SEED_BYTES) {
		throw new RangeError(
			`A seed needs at least ${MIN_SEED_BYTES} bytes, got ${seed.length}`,
		);
	}
	const next = createRandomStream(seed);
	const deck = fullDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = uniformInt(next, i + 1);
		[deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card];
	}
	return deck;
}
