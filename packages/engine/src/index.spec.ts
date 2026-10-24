import { readFileSync } from "node:fs";
import * as engine from "./index.js";

it("exports exactly the public API, nothing internal", () => {
	// Types are not listed: only runtime values can leak by accident.
	expect(Object.keys(engine).sort()).toEqual(
		[
			"CARD_COUNT",
			"HAND_CATEGORIES",
			"MAX_PLAYERS",
			"MIN_PLAYERS",
			"MIN_SEED_BYTES",
			"RANKS",
			"SUITS",
			"bytesToHex",
			"card",
			"categoryOfScore",
			"commitServerSeed",
			"compareHands",
			"decide",
			"deriveHandSeed",
			"evaluateHand",
			"evolve",
			"firstHandPositions",
			"formatCard",
			"formatCards",
			"fullDeck",
			"hexToBytes",
			"initialHandState",
			"isCard",
			"isRoyalFlush",
			"legalActions",
			"nextHandPositions",
			"parseCard",
			"parseCards",
			"rankOf",
			"redactEvent",
			"replayHand",
			"scoreHand",
			"shuffleDeck",
			"suitOf",
			"toPlayerView",
			"validateConfig",
			"verifyDeck",
		].sort(),
	);
});

describe("README", () => {
	const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
	const example = readFileSync(
		new URL("../examples/play-a-hand.ts", import.meta.url),
		"utf8",
	);

	it("shows the example exactly as it is tested", () => {
		expect(readme).toContain("```ts\n" + example + "```");
	});

	it("runs the example: a hand checked down to the showdown", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await import("../examples/play-a-hand.js");
		expect(log).toHaveBeenCalledWith("ann 1020, bob 990, cat 990");
		log.mockRestore();
	});
});
