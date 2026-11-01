import { z } from "zod";
import { Chips } from "../contracts/common/chips.js";
import { TableId } from "../contracts/common/ids.js";
import { Problem } from "../contracts/common/problem.js";
import {
	type ClientToServerEvents,
	defineEvent,
	defineNamespace,
	NAMESPACES,
	type ServerToClientEvents,
} from "./define.js";

// The table as clients see it (ADR-002): the engine's player view of the hand and its redacted
// events, plus the table around the hand. Never the deck, burn cards or hidden hole cards.
// Arrays are readonly and user ids plain uuids, so the engine's and the api's own types fit as
// they are: the server sends them without copying, and tests check that they parse.

/** A card as the engine numbers it: `rankIndex * 4 + suitIndex`, from 0 (2c) to 51 (As). */
export const Card = z.int().min(0).max(51);
export type Card = z.infer<typeof Card>;

/** A seat at the table, from 0; play moves towards higher seats. */
export const SeatIndex = z.int().min(0).max(9);
export type SeatIndex = z.infer<typeof SeatIndex>;

const HoleCards = z.tuple([Card, Card]).readonly();

/** A seated player, or someone watching. */
export const Viewer = z.union([SeatIndex, z.literal("spectator")]);
export type Viewer = z.infer<typeof Viewer>;

export const Street = z.enum(["preflop", "flop", "turn", "river"]);
export type Street = z.infer<typeof Street>;

export const Pot = z.object({
	amount: Chips,
	/** Seats still in the hand that can win it. */
	eligibleSeats: z.array(SeatIndex).readonly(),
});
export type Pot = z.infer<typeof Pot>;

/** What the player to act may do: the UI offers exactly this, and the table enforces it. */
export const LegalActions = z.object({
	seat: SeatIndex,
	canFold: z.literal(true),
	canCheck: z.boolean(),
	/** Chips a call adds, capped at the stack; 0 with nothing to call. */
	callAmount: Chips,
	/** Totals a bet or raise may go to ("raise to"); null when none is possible. */
	aggression: z
		.object({ kind: z.enum(["bet", "raise"]), minTo: Chips, maxTo: Chips })
		.nullable(),
});
export type LegalActions = z.infer<typeof LegalActions>;

/** A player dealt into the hand, as this viewer may see them. */
export const HandSeatView = z.object({
	seat: SeatIndex,
	playerId: z.uuid(),
	/** Chips behind, during the hand. */
	stack: Chips,
	/** Put in on this street, not yet in a pot. */
	bet: Chips,
	/** Put in this hand, collected or not. */
	committed: Chips,
	hasCards: z.boolean(),
	/** The viewer's own cards, and cards shown at the showdown; null otherwise. */
	holeCards: HoleCards.nullable(),
	folded: z.boolean(),
	allIn: z.boolean(),
	shown: z.boolean(),
	mucked: z.boolean(),
});
export type HandSeatView = z.infer<typeof HandSeatView>;

/** The hand as one viewer may see it: the engine's `toPlayerView`. */
export const HandView = z.discriminatedUnion("status", [
	z.object({ status: z.literal("idle"), viewer: Viewer }),
	z.object({
		status: z.enum(["in-progress", "ended"]),
		viewer: Viewer,
		handId: z.string(),
		smallBlind: Chips,
		bigBlind: Chips,
		ante: Chips,
		/** May be an empty seat: a dead button. */
		buttonSeat: SeatIndex,
		/** May be an empty seat: a dead small blind. */
		smallBlindSeat: SeatIndex,
		bigBlindSeat: SeatIndex,
		players: z.array(HandSeatView).readonly(),
		board: z.array(Card).readonly(),
		street: z.union([Street, z.literal("showdown")]),
		toAct: SeatIndex.nullable(),
		currentBet: Chips,
		minRaise: Chips,
		pots: z.array(Pot).readonly(),
		/** Set for the viewer when it is their turn to bet. */
		legalActions: LegalActions.nullable(),
	}),
]);
export type HandView = z.infer<typeof HandView>;

const ShownHand = z.object({
	category: z.enum([
		"high-card",
		"pair",
		"two-pair",
		"three-of-a-kind",
		"straight",
		"flush",
		"full-house",
		"four-of-a-kind",
		"straight-flush",
	]),
	/** The five cards that play, kickers last. */
	cards: z.array(Card).readonly(),
	/** The ranks its name needs, for the client to localize. */
	ranks: z
		.array(
			z.enum(["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]),
		)
		.readonly(),
});

const event = <Type extends string, Shape extends z.ZodRawShape>(
	type: Type,
	shape: Shape,
) => z.object({ type: z.literal(type), v: z.literal(1), ...shape });

/** A hand event with what this viewer may not see taken out: the engine's `redactEvent`. */
export const HandEventView = z.discriminatedUnion("type", [
	event("HandStarted", {
		handId: z.string(),
		smallBlind: Chips,
		bigBlind: Chips,
		ante: Chips,
		buttonSeat: SeatIndex,
		smallBlindSeat: SeatIndex,
		bigBlindSeat: SeatIndex,
		players: z
			.array(z.object({ seat: SeatIndex, playerId: z.uuid(), stack: Chips }))
			.readonly(),
	}),
	event("AntePosted", {
		seat: SeatIndex,
		amount: Chips,
		allIn: z.boolean(),
	}),
	event("BlindPosted", {
		seat: SeatIndex,
		blind: z.enum(["small", "big"]),
		amount: Chips,
		allIn: z.boolean(),
	}),
	event("HoleCardsDealt", {
		/** Every player dealt in; only the viewer's own cards are filled in. */
		hands: z
			.array(z.object({ seat: SeatIndex, cards: HoleCards.nullable() }))
			.readonly(),
	}),
	event("PlayerActed", {
		seat: SeatIndex,
		action: z.enum(["fold", "check", "call", "bet", "raise"]),
		amount: Chips,
		allIn: z.boolean(),
		/** Set when the turn timer acted for the player. */
		auto: z.literal(true).optional(),
	}),
	event("StreetDealt", {
		street: z.enum(["flop", "turn", "river"]),
		cards: z.array(Card).readonly(),
	}),
	event("UncalledBetReturned", { seat: SeatIndex, amount: Chips }),
	event("ShowdownStarted", {}),
	event("PotsCollected", { pots: z.array(Pot).readonly() }),
	event("CardsShown", { seat: SeatIndex, cards: HoleCards }),
	event("CardsMucked", {
		seat: SeatIndex,
		auto: z.literal(true).optional(),
	}),
	event("PotAwarded", {
		/** Index into the collected pots. */
		pot: z.int().nonnegative(),
		winners: z
			.array(
				z.object({
					seat: SeatIndex,
					amount: Chips,
					hand: ShownHand.optional(),
				}),
			)
			.readonly(),
	}),
	event("HandEnded", {
		stacks: z.array(z.object({ seat: SeatIndex, stack: Chips })).readonly(),
	}),
]);
export type HandEventView = z.infer<typeof HandEventView>;

/** How a seated player takes part: see the table decider for each status. */
export const SeatStatus = z.enum([
	"waiting-for-big-blind",
	"active",
	"sitting-out",
	"leaving",
]);
export type SeatStatus = z.infer<typeof SeatStatus>;

export const TableSettings = z.object({
	smallBlind: Chips,
	bigBlind: Chips,
	minBuyInBigBlinds: z.int().positive(),
	maxBuyInBigBlinds: z.int().positive(),
	maxSeats: z.int().min(2).max(9),
	turnSeconds: z.int().positive(),
	timeBankSeconds: z.int().nonnegative(),
	visibility: z.enum(["public", "private"]),
});
export type TableSettings = z.infer<typeof TableSettings>;

/** A seat's player between hands; during a hand, `hand.players` has the chips in play. */
export const SeatView = z.object({
	seat: SeatIndex,
	userId: z.uuid(),
	/** The stack the player brought into the current hand, or has between hands. */
	stack: Chips,
	status: SeatStatus,
	/** Time bank left: full when the player sits down, never refilled while they keep the seat. */
	timeBankMs: z.int().nonnegative(),
});
export type SeatView = z.infer<typeof SeatView>;

/** A table event as clients receive it: every one is public. */
export const TableEventView = z.discriminatedUnion("type", [
	event("TableOpened", { tableId: z.uuid(), config: TableSettings }),
	event("SeatTaken", { seat: SeatIndex, userId: z.uuid(), buyIn: Chips }),
	event("SeatLeft", { seat: SeatIndex, userId: z.uuid() }),
	event("PlayerStatusChanged", { seat: SeatIndex, status: SeatStatus }),
	event("ChipsAdded", {
		seat: SeatIndex,
		amount: Chips,
		reason: z.enum(["rebuy", "top-up"]),
	}),
	event("SpectatorJoined", { userId: z.uuid() }),
	event("SpectatorLeft", { userId: z.uuid() }),
	event("HandScheduled", {
		handId: z.string(),
		buttonSeat: SeatIndex,
		smallBlindSeat: SeatIndex,
		bigBlindSeat: SeatIndex,
		seats: z.array(SeatIndex).readonly(),
	}),
	event("DeckCommitted", {
		handId: z.string(),
		/** Lower-case hex SHA-256 of the server seed, published before the deal. */
		commitment: z.string().regex(/^[0-9a-f]{64}$/),
	}),
	/** After the hand: the seed itself, to check the deal with (`verifyDeck`). */
	event("DeckRevealed", {
		handId: z.string(),
		serverSeed: z.string().regex(/^(?:[0-9a-f]{2})+$/),
	}),
	event("TurnStarted", {
		handId: z.string(),
		seat: SeatIndex,
		/** When the turn began, in epoch milliseconds (server time). */
		startedAt: z.int().nonnegative(),
	}),
	event("TimeBankUsed", {
		seat: SeatIndex,
		usedMs: z.int().nonnegative(),
		remainingMs: z.int().nonnegative(),
	}),
	event("HandSettled", {
		handId: z.string(),
		stacks: z.array(z.object({ seat: SeatIndex, stack: Chips })).readonly(),
	}),
	event("TableClosed", {}),
]);
export type TableEventView = z.infer<typeof TableEventView>;

/**
 * Where a client is in the table's two streams: the table's, and the hand's (`hand.handId`) up to
 * `hand.version`. Every message carries it, so a client notices a missed batch (`followsVersions`)
 * and asks for a snapshot again by joining.
 */
export const TableVersions = z.object({
	tableVersion: z.int().nonnegative(),
	/** The current or last hand's stream; null before the table's first hand. */
	hand: z
		.object({ handId: z.string(), version: z.int().nonnegative() })
		.nullable(),
});
export type TableVersions = z.infer<typeof TableVersions>;

/** The seats' turn clock (POK-84): when the turn ends, and the time bank after it. */
export const TurnTimer = z.object({
	handId: z.string(),
	seat: SeatIndex,
	/** When the turn time runs out, before the time bank starts. */
	turnEndsAt: z.iso.datetime(),
	/** The time bank the player has left, drawn on once the turn time is out. */
	timeBankMs: z.int().nonnegative(),
});
export type TurnTimer = z.infer<typeof TurnTimer>;

/** The commitment to the hand's server seed, published before the deal (ADR-008, POK-86). */
export const FairnessCommitment = z.object({
	handId: z.string(),
	/** Lower-case hex SHA-256 of the server seed. */
	serverSeedHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type FairnessCommitment = z.infer<typeof FairnessCommitment>;

/** Everything one viewer may see of a table: the answer to `join`, and the `snapshot` event. */
export const TableView = z.object({
	tableId: TableId,
	versions: TableVersions,
	/** The server's clock when the view was taken, so the client can correct timers for skew. */
	serverTime: z.iso.datetime(),
	status: z.enum(["open", "closed"]),
	settings: TableSettings,
	seats: z.array(SeatView).readonly(),
	spectatorCount: z.int().nonnegative(),
	/** The current hand, or the last one until the next is dealt; idle before the first. */
	hand: HandView,
	/** The running turn clock, while a player is to act. */
	timer: TurnTimer.nullable(),
	/** The current hand's commitment, while one is being played. */
	fairness: FairnessCommitment.nullable(),
});
export type TableView = z.infer<typeof TableView>;

/**
 * What one command added, in the order the table took it, with the versions after it. `table`
 * and `hand` are each in order; a batch that deals a hand starts its stream (`HandStarted`).
 */
export const TableEventsBatch = z.object({
	tableId: TableId,
	versions: TableVersions,
	table: z.array(TableEventView).readonly(),
	hand: z.array(HandEventView).readonly(),
});
export type TableEventsBatch = z.infer<typeof TableEventsBatch>;

/**
 * Whether a batch comes right after what the client has: it then applies it; otherwise a batch
 * was missed, and the client joins again for a snapshot.
 */
export function followsVersions(
	known: TableVersions,
	batch: Pick<TableEventsBatch, "versions" | "table" | "hand">,
): boolean {
	const { versions } = batch;
	if (versions.tableVersion - batch.table.length !== known.tableVersion) {
		return false;
	}
	if (batch.hand.length === 0) {
		return (
			versions.hand?.handId === known.hand?.handId &&
			versions.hand?.version === known.hand?.version
		);
	}
	if (batch.hand[0]?.type === "HandStarted") {
		return versions.hand?.version === batch.hand.length;
	}
	return (
		versions.hand !== null &&
		versions.hand.handId === known.hand?.handId &&
		versions.hand.version - batch.hand.length === known.hand.version
	);
}

const tablePayload = <Shape extends z.ZodRawShape>(shape: Shape) =>
	z.object({ tableId: TableId, ...shape });

/** Commands answer once the table took them; their events follow in an `events` batch. */
export const TableCommandAck = z.object({});
export type TableCommandAck = z.infer<typeof TableCommandAck>;

/** Follow a table, as a seated player or a spectator; answers the table as this viewer sees it. */
export const JoinTableEvent = defineEvent(
	"join",
	tablePayload({ as: z.enum(["player", "spectator"]) }),
	TableView,
);
/** Stop following a table; a spectator stops watching it. */
export const LeaveTableEvent = defineEvent(
	"leave",
	tablePayload({}),
	TableCommandAck,
);
export const TakeSeatEvent = defineEvent(
	"take-seat",
	tablePayload({ seat: SeatIndex, buyIn: Chips }),
	TableCommandAck,
);
export const LeaveSeatEvent = defineEvent(
	"leave-seat",
	tablePayload({}),
	TableCommandAck,
);
export const SitOutEvent = defineEvent(
	"sit-out",
	tablePayload({}),
	TableCommandAck,
);
export const SitInEvent = defineEvent(
	"sit-in",
	tablePayload({}),
	TableCommandAck,
);
export const ActEvent = defineEvent(
	"act",
	tablePayload({
		action: z.enum(["fold", "check", "call", "bet", "raise", "all-in"]),
		/** For a bet or raise: the total bet on this street afterwards ("raise to"). */
		amount: Chips.optional(),
	}),
	TableCommandAck,
);
export const ShowCardsEvent = defineEvent(
	"show-cards",
	tablePayload({}),
	TableCommandAck,
);
export const MuckCardsEvent = defineEvent(
	"muck-cards",
	tablePayload({}),
	TableCommandAck,
);
/** More chips, up to the maximum buy-in, between the player's hands. */
export const TopUpEvent = defineEvent(
	"top-up",
	tablePayload({ amount: Chips }),
	TableCommandAck,
);
/** A new buy-in after losing the stack; then `sit-in` to be dealt in again. */
export const RebuyEvent = defineEvent(
	"rebuy",
	tablePayload({ amount: Chips }),
	TableCommandAck,
);

/** The whole table again, when the client has to start over (sent after `join` too). */
export const TableSnapshotEvent = defineEvent("snapshot", TableView);
export const TableEventsEvent = defineEvent("events", TableEventsBatch);
export const TurnTimerEvent = defineEvent(
	"timer",
	tablePayload({ timer: TurnTimer.nullable() }),
);
/** A failure that answers no command of this client, e.g. a deal on their table that failed. */
export const TableProblemEvent = defineEvent(
	"problem",
	tablePayload({ error: Problem }),
);

export const tableNamespace = defineNamespace(NAMESPACES.table, {
	clientToServer: [
		JoinTableEvent,
		LeaveTableEvent,
		TakeSeatEvent,
		LeaveSeatEvent,
		SitOutEvent,
		SitInEvent,
		ActEvent,
		ShowCardsEvent,
		MuckCardsEvent,
		TopUpEvent,
		RebuyEvent,
	],
	serverToClient: [
		TableSnapshotEvent,
		TableEventsEvent,
		TurnTimerEvent,
		TableProblemEvent,
	],
});

export type TableClientToServerEvents = ClientToServerEvents<
	typeof tableNamespace
>;
export type TableServerToClientEvents = ServerToClientEvents<
	typeof tableNamespace
>;
