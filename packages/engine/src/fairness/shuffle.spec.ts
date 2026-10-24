import { readFileSync } from "node:fs";
import { formatCards, fullDeck, parseCards } from "../cards/index.js";
import { bytesToHex, hexToBytes, uint32BigEndian } from "./bytes.js";
import { sha256 } from "./sha256.js";
import {
	createRandomStream,
	deriveHandSeed,
	MIN_SEED_BYTES,
	shuffleDeck,
	uniformInt,
} from "./shuffle.js";

interface TestVector {
	readonly name: string;
	readonly serverSeed: string;
	readonly handId: string;
	readonly clientSeeds: readonly string[];
	readonly commitment: string;
	readonly handSeed: string;
	readonly deck: string;
}

/** Committed vectors: any other implementation of the shuffle must reproduce them exactly. */
const vectors: readonly TestVector[] = JSON.parse(
	readFileSync(new URL("./test-vectors.json", import.meta.url), "utf8"),
);

/**
 * The same algorithm, written independently on top of Web Crypto (the API browsers have) and
 * reading only the documentation in shuffle.ts. It agreeing with the engine shows the spec is
 * complete and the engine's own hashing changes nothing.
 */
async function referenceDeck(
	serverSeed: Uint8Array,
	handId: string,
	clientSeeds: readonly string[],
): Promise<string> {
	const encoder = new TextEncoder();
	const field = (bytes: Uint8Array) => [
		...uint32BigEndian(bytes.length),
		...bytes,
	];
	const hmac = async (key: Uint8Array, message: number[]) => {
		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			key,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		return new Uint8Array(
			await crypto.subtle.sign("HMAC", cryptoKey, Uint8Array.from(message)),
		);
	};

	const handSeed = await hmac(
		serverSeed,
		["holdem/hand-seed/v1", handId, ...clientSeeds].flatMap((text) =>
			field(encoder.encode(text)),
		),
	);
	const numbers: number[] = [];
	for (let block = 0; numbers.length < 200; block++) {
		const bytes = await hmac(handSeed, [
			...field(encoder.encode("holdem/deck-stream/v1")),
			...uint32BigEndian(block),
		]);
		const view = new DataView(bytes.buffer);
		for (let offset = 0; offset < 32; offset += 4) {
			numbers.push(view.getUint32(offset));
		}
	}
	const deck = fullDeck();
	for (let i = 51; i > 0; i--) {
		const bound = i + 1;
		let value = numbers.shift() as number;
		while (value >= 2 ** 32 - (2 ** 32 % bound)) {
			value = numbers.shift() as number;
		}
		const j = value % bound;
		[deck[i], deck[j]] = [deck[j]!, deck[i]!];
	}
	return formatCards(deck);
}

const seedOf = (index: number) => sha256(uint32BigEndian(index));

describe("deriveHandSeed", () => {
	const serverSeed = hexToBytes("11".repeat(32));

	it("gives 32 bytes that depend on the hand id and every client seed, in order", () => {
		const base = bytesToHex(deriveHandSeed(serverSeed, "hand-1"));
		expect(base).toHaveLength(64);
		const variants = [
			deriveHandSeed(serverSeed, "hand-1", []),
			deriveHandSeed(serverSeed, "hand-2"),
			deriveHandSeed(hexToBytes("12".repeat(32)), "hand-1"),
			deriveHandSeed(serverSeed, "hand-1", ["alice"]),
			deriveHandSeed(serverSeed, "hand-1", ["alice", "bob"]),
			deriveHandSeed(serverSeed, "hand-1", ["bob", "alice"]),
		].map(bytesToHex);
		expect(variants[0]).toBe(base);
		expect(new Set(variants.slice(1)).size).toBe(5);
		expect(variants.slice(1)).not.toContain(base);
	});

	it("frames every field, so moving characters between fields changes the seed", () => {
		const a = bytesToHex(deriveHandSeed(serverSeed, "ab", ["c"]));
		const b = bytesToHex(deriveHandSeed(serverSeed, "a", ["bc"]));
		const c = bytesToHex(deriveHandSeed(serverSeed, "abc"));
		expect(new Set([a, b, c]).size).toBe(3);
	});
});

describe("shuffleDeck", () => {
	it("is a permutation of the 52 cards, the same for the same seed", () => {
		const seed = seedOf(1);
		const deck = shuffleDeck(seed);
		expect(deck.toSorted((x, y) => x - y)).toEqual(fullDeck());
		expect(shuffleDeck(seed)).toEqual(deck);
		expect(shuffleDeck(Uint8Array.from(seed))).toEqual(deck);
		expect(deck).not.toEqual(fullDeck());
	});

	it("gives a different order for every one of 2,000 seeds", () => {
		const decks = new Set(
			Array.from({ length: 2000 }, (_, index) =>
				formatCards(shuffleDeck(seedOf(index))),
			),
		);
		expect(decks.size).toBe(2000);
	});

	it(`needs a seed of at least ${MIN_SEED_BYTES} bytes`, () => {
		expect(() => shuffleDeck(new Uint8Array(MIN_SEED_BYTES - 1))).toThrow(
			RangeError,
		);
		expect(shuffleDeck(new Uint8Array(MIN_SEED_BYTES))).toHaveLength(52);
	});

	it("reproduces the committed test vectors", () => {
		expect(vectors.length).toBeGreaterThanOrEqual(3);
		for (const vector of vectors) {
			const handSeed = deriveHandSeed(
				hexToBytes(vector.serverSeed),
				vector.handId,
				vector.clientSeeds,
			);
			expect(bytesToHex(handSeed), vector.name).toBe(vector.handSeed);
			expect(
				bytesToHex(sha256(hexToBytes(vector.serverSeed))),
				vector.name,
			).toBe(vector.commitment);
			expect(formatCards(shuffleDeck(handSeed)), vector.name).toBe(vector.deck);
			expect(parseCards(vector.deck)).toHaveLength(52);
		}
	});

	it("agrees with an independent implementation on Web Crypto, as a browser would run it", async () => {
		for (const vector of vectors) {
			expect(
				await referenceDeck(
					hexToBytes(vector.serverSeed),
					vector.handId,
					vector.clientSeeds,
				),
				vector.name,
			).toBe(vector.deck);
		}
		for (let index = 0; index < 20; index++) {
			const serverSeed = seedOf(index);
			const clientSeeds = index % 2 === 0 ? [] : [`seat-${index}`, "Игрок 🂡"];
			expect(
				await referenceDeck(serverSeed, `hand-${index}`, clientSeeds),
			).toBe(
				formatCards(
					shuffleDeck(deriveHandSeed(serverSeed, `hand-${index}`, clientSeeds)),
				),
			);
		}
	});

	it(
		"places every card at every position equally often (chi-square, p > 0.001)",
		{ tags: ["slow"], timeout: 60_000 },
		() => {
			const shuffles = 52 * 300;
			const counts = new Array<number>(52 * 52).fill(0);
			for (let index = 0; index < shuffles; index++) {
				shuffleDeck(seedOf(index)).forEach((card, position) => {
					counts[position * 52 + card]! += 1;
				});
			}
			const expected = shuffles / 52;
			const chiSquare = counts.reduce(
				(sum, observed) => sum + (observed - expected) ** 2 / expected,
				0,
			);
			// Rows and columns of a permutation table are fixed, so there are 51 × 51 degrees of
			// freedom. The 0.1% critical value comes from the Wilson–Hilferty approximation.
			const freedom = 51 * 51;
			const z = 3.0902;
			const critical =
				freedom *
				(1 - 2 / (9 * freedom) + z * Math.sqrt(2 / (9 * freedom))) ** 3;
			expect(chiSquare).toBeLessThan(critical);
			// Far below the degrees of freedom would mean an order too regular to be random.
			expect(chiSquare).toBeGreaterThan(freedom * 0.85);
		},
	);
});

describe("createRandomStream", () => {
	it("reads eight 32-bit numbers from each block, then moves to the next block", () => {
		const next = createRandomStream(seedOf(7));
		const values = Array.from({ length: 17 }, next);
		expect(new Set(values).size).toBe(17);
		expect(
			values.every(
				(value) => Number.isInteger(value) && value >= 0 && value < 2 ** 32,
			),
		).toBe(true);
		const again = createRandomStream(seedOf(7));
		expect(Array.from({ length: 17 }, again)).toEqual(values);
	});
});

describe("uniformInt", () => {
	const fromList = (values: number[]) => () => values.shift() as number;

	it("draws again when a number would bias the result", () => {
		// 2^32 mod 3 = 1, so only the very top number is rejected.
		expect(uniformInt(fromList([2 ** 32 - 1, 7]), 3)).toBe(1);
		expect(uniformInt(fromList([2 ** 32 - 2]), 3)).toBe((2 ** 32 - 2) % 3);
		// 2^32 mod 52 = 48, so the top 48 numbers are rejected.
		expect(
			uniformInt(fromList([2 ** 32 - 48, 2 ** 32 - 1, 2 ** 32 - 49]), 52),
		).toBe((2 ** 32 - 49) % 52);
	});

	it("never rejects for a power-of-two bound", () => {
		expect(uniformInt(fromList([2 ** 32 - 1]), 4)).toBe(3);
	});
});
