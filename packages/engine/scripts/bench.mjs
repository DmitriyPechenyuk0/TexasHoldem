// Measures the hand evaluator on the built package: `pnpm bench`.
import { evaluateHand, scoreHand, shuffleDeck } from "../dist/index.js";

// 10,000 fixed seven-card hands, the same on every run.
const hands = Array.from({ length: 10_000 }, (_, index) => {
	const seed = new Uint8Array(16);
	new DataView(seed.buffer).setUint32(0, index);
	return shuffleDeck(seed).slice(0, 7);
});

function measure(name, evaluate, rounds) {
	for (const hand of hands) evaluate(hand); // warm-up
	const start = performance.now();
	for (let round = 0; round < rounds; round++) {
		for (const hand of hands) evaluate(hand);
	}
	const seconds = (performance.now() - start) / 1000;
	const perSecond = (rounds * hands.length) / seconds;
	console.log(
		`${name.padEnd(14)} ${(perSecond / 1e6).toFixed(2)}M seven-card hands/s`,
	);
}

console.log(`Node ${process.version}`);
measure("scoreHand", scoreHand, 300);
measure("evaluateHand", evaluateHand, 50);
