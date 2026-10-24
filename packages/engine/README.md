# @holdem/engine

The rules of No-Limit Texas Hold'em ([RULES.md](../../RULES.md)) as pure, deterministic TypeScript: no I/O, no clock, no randomness of its own, no runtime dependencies (ADR-001). The api runs it as the authority; the web app runs the same code for replays and checks.

## Modules

- **Cards** (`src/cards`): `Card` is a number from 0 (`2c`) to 51 (`As`), `rankIndex * 4 + suitIndex`. `parseCard("As")`, `formatCard`, `parseCards("As Kd 7h")`, `fullDeck()` in canonical order.
- **Hand evaluator** (`src/evaluator`): `scoreHand(cards)` scores the best five of 5 to 7 cards as one number (higher wins, equal splits); `evaluateHand(cards)` also returns the category, the five cards that play and the ranks a localized description needs; `compareHands(a, b)`.
- **Hand decider** (`src/hand`): one hand as a Decider (ADR-002). `decide(command, state)` returns the events a command causes or a `HandError` with a stable `hand.*` code; `evolve(state, event)` applies one event; `replayHand(events)` rebuilds the state. Events are plain JSON with a `type` and a schema version `v`. Tests use the harness in `src/testing`: `given(events).when(command).then(events or error)`.
- **Provably fair shuffle** (`src/fairness`): `commitServerSeed`, `deriveHandSeed`, `shuffleDeck` and `verifyDeck`, built on HMAC-SHA256 (ADR-008). The construction is documented in `src/fairness/shuffle.ts`; `src/fairness/test-vectors.json` holds vectors any other implementation must reproduce.

## Scripts

```bash
pnpm test                               # every test, including the slow statistical ones
pnpm exec vitest --tags-filter='!slow'  # watch mode without the slow tests
pnpm test:coverage                      # with the 100% coverage gate
pnpm bench                              # builds, then measures the evaluator
```

Tests tagged `slow` are the exhaustive or statistical checks: every one of the 2,598,960 five-card hands ranked into the 7,462 known classes, and a chi-square test of the shuffle.

## Benchmark

`pnpm bench` on 10,000 fixed seven-card hands, Node 24.15, AMD Ryzen 5 5600G:

| Function | Seven-card hands per second |
| --- | --- |
| `scoreHand` | 9.0 M |
| `evaluateHand` | 1.2 M |

Showdowns only need `scoreHand` to rank players; `evaluateHand` is for the hand shown to people.
