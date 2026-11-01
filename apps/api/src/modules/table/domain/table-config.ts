import type { Chips } from "@holdem/engine";

export type TableVisibility = "public" | "private";

/** How a table plays; the lobby picks it (customer–supplier), the table enforces it. */
export interface TableConfig {
	readonly smallBlind: Chips;
	readonly bigBlind: Chips;
	/** The buy-in range, in big blinds: chips are unlimited (ADR-009), only the amount is bounded. */
	readonly minBuyInBigBlinds: number;
	readonly maxBuyInBigBlinds: number;
	readonly maxSeats: number;
	/** Seconds a player has for each decision. */
	readonly turnSeconds: number;
	/** Extra seconds a player can draw on when the turn time runs out (POK-84). */
	readonly timeBankSeconds: number;
	/**
	 * Seconds a disconnected player has to come back before they sit out (POK-85). Meanwhile, their
	 * turns are cut to `disconnectedTurnSeconds`.
	 */
	readonly reconnectGraceSeconds: number;
	/** Seconds a disconnected player's turn lasts, from the turn's start or the disconnect. */
	readonly disconnectedTurnSeconds: number;
	/** A player who sits out this long loses the seat. */
	readonly sitOutSeconds: number;
	/** So does one who sits out this many hands. */
	readonly sitOutHands: number;
	/** Private tables are not listed in the lobby. */
	readonly visibility: TableVisibility;
}

export const MIN_TABLE_SEATS = 2;
export const MAX_TABLE_SEATS = 9;
export const MIN_TURN_SECONDS = 5;
export const MAX_TURN_SECONDS = 120;
export const MAX_TIME_BANK_SECONDS = 600;
export const MAX_RECONNECT_GRACE_SECONDS = 600;
export const MAX_SIT_OUT_SECONDS = 3600;
export const MAX_SIT_OUT_HANDS = 100;

/**
 * The absence policy every table gets unless the lobby picks another (POK-85): two minutes to
 * reconnect, with five-second turns meanwhile; a seat is lost after ten minutes or three hands
 * sitting out.
 */
export const DEFAULT_ABSENCE_POLICY = {
	reconnectGraceSeconds: 120,
	disconnectedTurnSeconds: 5,
	sitOutSeconds: 600,
	sitOutHands: 3,
} as const satisfies Partial<TableConfig>;

/** Which part of a `TableConfig` is wrong. */
export type InvalidTableConfigReason =
	| "table-id"
	| "blinds"
	| "buy-in"
	| "seats"
	| "turn-time"
	| "time-bank"
	| "reconnect-grace"
	| "disconnected-turn-time"
	| "sit-out"
	| "visibility";

const isPositiveInteger = (value: number) =>
	Number.isSafeInteger(value) && value > 0;

const inRange = (value: number, min: number, max: number) =>
	Number.isSafeInteger(value) && value >= min && value <= max;

/** The chips a player may sit down with. */
export const buyInRange = (
	config: TableConfig,
): { readonly min: Chips; readonly max: Chips } => ({
	min: config.minBuyInBigBlinds * config.bigBlind,
	max: config.maxBuyInBigBlinds * config.bigBlind,
});

/** The first problem with a config, or null when a table can open with it. */
export function validateTableConfig(
	config: TableConfig,
): InvalidTableConfigReason | null {
	if (
		!isPositiveInteger(config.smallBlind) ||
		!isPositiveInteger(config.bigBlind) ||
		config.smallBlind > config.bigBlind
	) {
		return "blinds";
	}
	// Every full table's chips must stay a safe integer, so the engine can add them up.
	if (
		!isPositiveInteger(config.minBuyInBigBlinds) ||
		!isPositiveInteger(config.maxBuyInBigBlinds) ||
		config.minBuyInBigBlinds > config.maxBuyInBigBlinds ||
		!Number.isSafeInteger(buyInRange(config).max * MAX_TABLE_SEATS)
	) {
		return "buy-in";
	}
	if (!inRange(config.maxSeats, MIN_TABLE_SEATS, MAX_TABLE_SEATS)) {
		return "seats";
	}
	if (!inRange(config.turnSeconds, MIN_TURN_SECONDS, MAX_TURN_SECONDS)) {
		return "turn-time";
	}
	if (!inRange(config.timeBankSeconds, 0, MAX_TIME_BANK_SECONDS)) {
		return "time-bank";
	}
	if (!inRange(config.reconnectGraceSeconds, 0, MAX_RECONNECT_GRACE_SECONDS)) {
		return "reconnect-grace";
	}
	if (!inRange(config.disconnectedTurnSeconds, 1, MAX_TURN_SECONDS)) {
		return "disconnected-turn-time";
	}
	if (
		!inRange(config.sitOutSeconds, 1, MAX_SIT_OUT_SECONDS) ||
		!inRange(config.sitOutHands, 1, MAX_SIT_OUT_HANDS)
	) {
		return "sit-out";
	}
	if (config.visibility !== "public" && config.visibility !== "private") {
		return "visibility";
	}
	return null;
}
