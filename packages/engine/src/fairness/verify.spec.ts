import { type Card, formatCard, parseCards } from "../cards/index.js";
import { hexToBytes } from "./bytes.js";
import { deriveHandSeed, shuffleDeck } from "./shuffle.js";
import { commitServerSeed, verifyDeck } from "./verify.js";

const serverSeed = hexToBytes("5e".repeat(32));
const handId = "8c4f2a1e-3b5d-4e6f-9a0b-1c2d3e4f5a6b";
const clientSeeds = ["alice-entropy", "bob-entropy"];
const commitment = commitServerSeed(serverSeed);
const deck = shuffleDeck(deriveHandSeed(serverSeed, handId, clientSeeds));
// Two players' hole cards, burns and a full board: the first 13 cards from the top.
const dealtCards = deck.slice(0, 13);

describe("commitServerSeed", () => {
	it("is the lower-case hex SHA-256 of the seed", () => {
		expect(commitServerSeed(new Uint8Array())).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(commitment).toMatch(/^[\da-f]{64}$/);
	});
});

describe("verifyDeck", () => {
	it("confirms an honest hand and returns the whole deck", () => {
		expect(
			verifyDeck({ serverSeed, commitment, handId, clientSeeds, dealtCards }),
		).toEqual({
			ok: true,
			deck,
		});
	});

	it("accepts a commitment written in upper case, and no dealt cards at all", () => {
		expect(
			verifyDeck({
				serverSeed,
				commitment: commitment.toUpperCase(),
				handId,
				clientSeeds,
				dealtCards: [],
			}).ok,
		).toBe(true);
	});

	it("rejects a server seed that does not match the commitment", () => {
		expect(
			verifyDeck({
				serverSeed: hexToBytes("5f".repeat(32)),
				commitment,
				handId,
				clientSeeds,
				dealtCards,
			}),
		).toEqual({ ok: false, reason: "commitment-mismatch" });
	});

	it("points at the first card that differs from the rebuilt deck", () => {
		const tampered = [...dealtCards];
		const swapped = deck[20] as Card;
		tampered[4] = swapped;
		expect(
			verifyDeck({
				serverSeed,
				commitment,
				handId,
				clientSeeds,
				dealtCards: tampered,
			}),
		).toEqual({
			ok: false,
			reason: "card-mismatch",
			index: 4,
			expected: deck[4],
			actual: swapped,
		});
	});

	it("rebuilds a different deck when a client seed or the hand id is wrong", () => {
		for (const input of [
			{ handId: "another-hand", clientSeeds },
			{ handId, clientSeeds: ["alice-entropy"] },
			{ handId, clientSeeds: [...clientSeeds].reverse() },
		]) {
			const result = verifyDeck({
				serverSeed,
				commitment,
				dealtCards,
				...input,
			});
			expect(result.ok).toBe(false);
			expect(result.ok === false && result.reason).toBe("card-mismatch");
		}
	});

	it("rejects more cards than a deck holds", () => {
		const tooMany = [...deck, ...parseCards("As")];
		expect(
			verifyDeck({
				serverSeed,
				commitment,
				handId,
				clientSeeds,
				dealtCards: tooMany,
			}),
		).toEqual({ ok: false, reason: "too-many-cards" });
		expect(formatCard(tooMany[52] as Card)).toBe("As");
	});
});
