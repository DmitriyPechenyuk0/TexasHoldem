# @holdem/engine

The rules of No-Limit Texas Hold'em ([RULES.md](../../RULES.md)) as pure, deterministic TypeScript: no I/O, no clock, no randomness of its own, no runtime dependencies (ADR-001). The api runs it as the authority; the web app runs the same code for replays and checks.

## Modules

- **Cards** (`src/cards`): `Card` is a number from 0 (`2c`) to 51 (`As`), `rankIndex * 4 + suitIndex`. `parseCard("As")`, `formatCard`, `parseCards("As Kd 7h")`, `fullDeck()` in canonical order.
- **Hand evaluator** (`src/evaluator`): `scoreHand(cards)` scores the best five of 5 to 7 cards as one number (higher wins, equal splits); `evaluateHand(cards)` also returns the category, the five cards that play and the ranks a localized description needs; `compareHands(a, b)`.
- **Hand decider** (`src/hand`): one hand as a Decider (ADR-002). `decide(command, state)` returns the events a command causes or a `HandError` with a stable `hand.*` code; `evolve(state, event)` applies one event; `replayHand(events)` rebuilds the state. `legalActions(state, seat)` says what the player to act may do (fold, check, the call amount, the bet or raise range as totals); the UI shows exactly that and `decide` enforces it. A command that closes a betting round also carries what follows on its own: the uncalled bet returned, the bets collected into the main pot and side pots (`buildPots`), then the next street with its burn card, the board run out when nobody can bet with every hand turned up first (TDA 16), or the pot for the last player left. At the showdown, hands that can win are turned up in order (TDA 17); a player who can only lose gets the turn to show or muck, and a `Timeout` mucks. Pots are awarded side pots first, ties split with the odd chip to the first winner left of the button. Events are plain JSON with a `type` and a schema version `v`. What a client may see comes from `toPlayerView(state, viewer)` and `redactEvent(event, viewer)`, for a seat or `"spectator"`: never the deck order or a burn card, and another player's hole cards only once shown; the player to act also gets their `legalActions`. Send clients only these, never raw state or events. Tests use the harness in `src/testing`: `given(events).when(command).then(events or error)`, and `simulateHand(config, picks)` plays a random legal hand to the end.
- **Table rotation** (`src/table`): where the button and the blinds go for the next hand. `firstHandPositions(seats, buttonSeat)` places the blinds left of the drawn button; `nextHandPositions(previous, seated)` follows the dead button rule (RULES §4, TDA 32) in cash games too: the big blind moves forward exactly one seated player, the small blind takes the old big blind's seat (dead, so nobody posts it, if that player left) and the button the old small blind's seat (possibly empty). Heads-up the button posts the small blind (TDA 34-B). New players wait for the big blind: they are dealt in when it reaches their seat. When it returns null with two or more players seated, the table starts over with `firstHandPositions`. `HandConfig` takes the three seats as they are.
- **Provably fair shuffle** (`src/fairness`): `commitServerSeed`, `deriveHandSeed`, `shuffleDeck` and `verifyDeck`, built on HMAC-SHA256 (ADR-008). The construction is documented in `src/fairness/shuffle.ts`; `src/fairness/test-vectors.json` holds vectors any other implementation must reproduce.

## Scripts

```bash
pnpm test                               # every test, including the slow statistical ones
pnpm exec vitest --tags-filter='!slow'  # watch mode without the slow tests
pnpm test:coverage                      # with the 100% coverage gate
pnpm bench                              # builds, then measures the evaluator
```

`src/hand/simulation.spec.ts` plays random whole hands (2 to 9 players, any stacks, blinds, ante, button and deck) and checks the invariants after every event: chips are conserved, no stack goes negative, exactly one seat is to act while betting is open, cards come off the top of the deck in order, every pot is awarded and replaying the stored events gives the live state. CI plays 1,000 hands; run more locally with `HOLDEM_SIM_RUNS=10000 pnpm --filter @holdem/engine test simulation`. A failure prints a seed and a path: `HOLDEM_SIM_SEED=<seed> HOLDEM_SIM_PATH=<path>` replays that shrunk hand.

Tests tagged `slow` are the exhaustive or statistical checks: every one of the 2,598,960 five-card hands ranked into the 7,462 known classes, and a chi-square test of the shuffle.

## Benchmark

`pnpm bench` on 10,000 fixed seven-card hands, Node 24.15, AMD Ryzen 5 5600G:

| Function | Seven-card hands per second |
| --- | --- |
| `scoreHand` | 9.0 M |
| `evaluateHand` | 1.2 M |

Showdowns only need `scoreHand` to rank players; `evaluateHand` is for the hand shown to people.
