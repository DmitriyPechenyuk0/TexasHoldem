# @holdem/engine

The rules of No-Limit Texas Hold'em ([RULES.md](../../RULES.md)) as pure, deterministic TypeScript: no I/O, no clock, no randomness of its own, no runtime dependencies (ADR-001). The api runs it as the authority; the web app runs the same code for replays and checks.

## Concepts

- **Decider** (ADR-002). A hand is two pure functions: `decide(command, state)` returns the events a command causes, or a `HandError` with a stable `hand.*` code that clients translate; `evolve(state, event)` applies one event. `decide` never changes the state it is given. The commands are `StartHand`, `Act`, `Timeout`, `ShowCards` and `MuckCards`; a command that closes a betting round also carries everything that follows on its own, up to the next decision.
- **Events are the record.** They are plain JSON with a `type` and a schema version `v`; a stored hand is its list of events, and `replayHand(events)` rebuilds the state. A schema change bumps `v` and adds an upcaster; stored events are never rewritten.
- **One turn at a time.** `state.toAct` is the seat the hand waits for, while betting and at the showdown. `legalActions(state, seat)` says what that player may bet; the UI offers exactly that and `decide` enforces it.
- **Views, not state, go to clients.** `toPlayerView(state, viewer)` and `redactEvent(event, viewer)` leave out the deck order, the burn cards and hole cards nobody has shown.
- **The table owns what lies between hands:** who is dealt in and where the button and blinds go (`firstHandPositions`, `nextHandPositions`), and the deck, from `shuffleDeck(deriveHandSeed(serverSeed, handId, clientSeeds))` after publishing `commitServerSeed(serverSeed)` (ADR-008). Anyone can check a finished hand with `verifyDeck`.

## Usage

One hand, checked down to the showdown (`examples/play-a-hand.ts`, run by `src/index.spec.ts`):

```ts
import {
	decide,
	deriveHandSeed,
	evolve,
	type HandCommand,
	type HandState,
	initialHandState,
	legalActions,
	shuffleDeck,
} from "@holdem/engine";

// The deck comes from the server seed (ADR-008); a real table draws it with crypto.getRandomValues.
const serverSeed = new Uint8Array(32).fill(7);
const deck = shuffleDeck(deriveHandSeed(serverSeed, "hand-1"));
const players = ["ann", "bob", "cat"].map((playerId, seat) => ({
	seat,
	playerId,
	stack: 1000,
}));

let state: HandState = initialHandState;
function send(command: HandCommand) {
	const decision = decide(command, state);
	if (!decision.ok) throw new Error(decision.error.code);
	state = decision.events.reduce(evolve, state);
}

send({
	type: "StartHand",
	config: {
		handId: "hand-1",
		smallBlind: 5,
		bigBlind: 10,
		ante: 0,
		buttonSeat: 0,
		smallBlindSeat: 1,
		bigBlindSeat: 2,
		players,
		deck,
	},
});
// Everyone checks or calls down; at the showdown a beaten hand is shown rather than mucked.
while (state.status === "in-progress") {
	const seat = state.toAct!;
	const legal = legalActions(state, seat);
	send(
		legal
			? { type: "Act", seat, action: legal.canCheck ? "check" : "call" }
			: { type: "ShowCards", seat },
	);
}
if (state.status === "ended") {
	const stacks = state.players.map(
		({ playerId, stack }) => `${playerId} ${stack}`,
	);
	console.log(stacks.join(", "));
}
```

It prints `ann 1020, bob 990, cat 990`.

## Public API

`src/index.ts` is the whole public surface; everything else under `src` is internal. `src/index.spec.ts` pins the list.

| Area      | Exports                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards     | `Card`, `Rank`, `Suit`, `CardText`, `RANKS`, `SUITS`, `CARD_COUNT`, `card`, `isCard`, `parseCard`, `parseCards`, `formatCard`, `formatCards`, `rankOf`, `suitOf`, `fullDeck`                                                                                                                            |
| Evaluator | `scoreHand`, `evaluateHand`, `compareHands`, `categoryOfScore`, `isRoyalFlush`, `HAND_CATEGORIES`, `HandScore`, `HandValue`, `HandCategory`                                                                                                                                                             |
| Fairness  | `commitServerSeed`, `deriveHandSeed`, `shuffleDeck`, `verifyDeck`, `MIN_SEED_BYTES`, `bytesToHex`, `hexToBytes`, `DeckVerification`, `DeckVerificationInput`                                                                                                                                            |
| Hand      | `decide`, `evolve`, `replayHand`, `initialHandState`, `validateConfig`, `legalActions`, `MIN_PLAYERS`, `MAX_PLAYERS`, and the types `HandConfig`, `HandPlayer`, `HandCommand`, `HandEvent`, `HandState`, `HandError`, `Decision`, `LegalActions`, `Pot`, `Street`, `Chips`, `SeatIndex` and their parts |
| Views     | `toPlayerView`, `redactEvent`, `PlayerView`, `PlayerSeatView`, `PlayerEvent`, `Viewer`                                                                                                                                                                                                                  |
| Table     | `firstHandPositions`, `nextHandPositions`, `HandPositions`, `SeatedPlayer`                                                                                                                                                                                                                              |

## Modules

- **Cards** (`src/cards`): `Card` is a number from 0 (`2c`) to 51 (`As`), `rankIndex * 4 + suitIndex`. `parseCard("As")`, `formatCard`, `parseCards("As Kd 7h")`, `fullDeck()` in canonical order.
- **Hand evaluator** (`src/evaluator`): `scoreHand(cards)` scores the best five of 5 to 7 cards as one number (higher wins, equal splits); `evaluateHand(cards)` also returns the category, the five cards that play and the ranks a localized description needs; `compareHands(a, b)`.
- **Hand decider** (`src/hand`): one hand as a Decider (ADR-002). `decide(command, state)` returns the events a command causes or a `HandError` with a stable `hand.*` code; `evolve(state, event)` applies one event; `replayHand(events)` rebuilds the state. `legalActions(state, seat)` says what the player to act may do (fold, check, the call amount, the bet or raise range as totals); the UI shows exactly that and `decide` enforces it. A command that closes a betting round also carries what follows on its own: the uncalled bet returned, the bets collected into the main pot and side pots, then the next street with its burn card, the board run out when nobody can bet with every hand turned up first (TDA 16), or the pot for the last player left. At the showdown, hands that can win are turned up in order (TDA 17); a player who can only lose gets the turn to show or muck, and a `Timeout` mucks. Pots are awarded side pots first, ties split with the odd chip to the first winner left of the button. Events are plain JSON with a `type` and a schema version `v`. What a client may see comes from `toPlayerView(state, viewer)` and `redactEvent(event, viewer)`, for a seat or `"spectator"`: never the deck order or a burn card, and another player's hole cards only once shown; the player to act also gets their `legalActions`. Send clients only these, never raw state or events.
- **Table rotation** (`src/table`): where the button and the blinds go for the next hand. `firstHandPositions(seats, buttonSeat)` places the blinds left of the drawn button; `nextHandPositions(previous, seated)` follows the dead button rule (RULES §4, TDA 32) in cash games too: the big blind moves forward exactly one seated player, the small blind takes the old big blind's seat (dead, so nobody posts it, if that player left) and the button the old small blind's seat (possibly empty). Heads-up the button posts the small blind (TDA 34-B). New players wait for the big blind: they are dealt in when it reaches their seat. When it returns null with two or more players seated, the table starts over with `firstHandPositions`. `HandConfig` takes the three seats as they are.
- **Provably fair shuffle** (`src/fairness`): `commitServerSeed`, `deriveHandSeed`, `shuffleDeck` and `verifyDeck`, built on HMAC-SHA256 (ADR-008). The construction is documented in `src/fairness/shuffle.ts`; `src/fairness/test-vectors.json` holds vectors any other implementation must reproduce.

## RULES.md in the code

| RULES.md                               | Code                                                     | Tests                                                 |
| -------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| §2 Cards and Deck                      | `src/cards`, `src/fairness`                              | `cards/*.spec.ts`, `fairness/*.spec.ts`               |
| §3 Table Positions                     | `hand/positions.ts`, `table/rotation.ts`                 | `hand/start-hand.spec.ts`, `table/rotation.spec.ts`   |
| §4 Blinds and Antes, dead button       | `hand/decide.ts` (start of hand), `table/rotation.ts`    | `hand/start-hand.spec.ts`, `table/rotation.spec.ts`   |
| §5 Dealing a Hand                      | `hand/decide.ts`, `hand/streets.ts`                      | `hand/start-hand.spec.ts`, `hand/streets.spec.ts`     |
| §6 Betting Rounds                      | `hand/betting.ts`, `hand/evolve.ts`                      | `hand/betting.spec.ts`                                |
| §7 Player Actions                      | `hand/decide.ts`, `hand/betting.ts`                      | `hand/betting.spec.ts`                                |
| §8 No-Limit Betting Rules              | `hand/betting.ts`                                        | `hand/betting.spec.ts`, `hand/reopening.spec.ts`      |
| §9 All-In and Side Pots                | `hand/pots.ts`, `hand/streets.ts`                        | `hand/pots.spec.ts`, `hand/streets.spec.ts`           |
| §10 Showdown                           | `hand/showdown.ts`                                       | `hand/showdown.spec.ts`                               |
| §11 Hand Rankings                      | `src/evaluator`                                          | `evaluator/evaluate.spec.ts`                          |
| §12 Comparing Hands and Splitting Pots | `src/evaluator`, `hand/showdown.ts`                      | `evaluator/evaluate.spec.ts`, `hand/showdown.spec.ts` |
| §13 Tournament Rules                   | not in the engine: cash games only for now               | —                                                     |
| §14 Irregularities, §15 Etiquette      | not applicable: a software dealer makes no live mistakes | —                                                     |

The whole hand, across every section, is also checked by the random simulation in `hand/simulation.spec.ts`, and what each viewer sees by `hand/view.spec.ts`.

## Testing

```bash
pnpm test                               # every test, including the slow statistical ones
pnpm exec vitest --tags-filter='!slow'  # watch mode without the slow tests
pnpm test:coverage                      # with the 100% coverage gate
pnpm bench                              # builds, then measures the evaluator
```

- **Coverage gate.** `vitest.config.ts` sets a 100% threshold for every file under `src`, tested or not, and CI runs `pnpm test:coverage`: an uncovered line, branch or function fails the build.
- **Harness.** Tests use `src/testing`: `given(events).when(command).then(events or error)`, fixtures such as `riggedDeck` to deal chosen cards, and `simulateHand(config, picks)` to play a random legal hand to the end.
- **Simulation.** `src/hand/simulation.spec.ts` plays random whole hands (2 to 9 players, any stacks, blinds, ante, button and deck) and checks the invariants after every event: chips are conserved, no stack goes negative, exactly one seat is to act while betting is open, cards come off the top of the deck in order, every pot is awarded and replaying the stored events gives the live state. CI plays 1,000 hands; run more locally with `HOLDEM_SIM_RUNS=10000 pnpm --filter @holdem/engine test simulation`. A failure prints a seed and a path: `HOLDEM_SIM_SEED=<seed> HOLDEM_SIM_PATH=<path>` replays that shrunk hand.
- **Slow tests.** Tests tagged `slow` are the exhaustive or statistical checks: every one of the 2,598,960 five-card hands ranked into the 7,462 known classes, and a chi-square test of the shuffle.

## Benchmark

`pnpm bench` on 10,000 fixed seven-card hands, Node 24.15, AMD Ryzen 5 5600G:

| Function       | Seven-card hands per second |
| -------------- | --------------------------- |
| `scoreHand`    | 9.0 M                       |
| `evaluateHand` | 1.2 M                       |

Showdowns only need `scoreHand` to rank players; `evaluateHand` is for the hand shown to people.
