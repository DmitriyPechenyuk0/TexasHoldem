import type { LobbyTable } from "../domain/lobby-table.js";
import { presetById } from "../domain/stake-presets.js";

/** A table as the lobby lists it (`LobbyTable` of the shared contracts). */
export interface LobbyListing {
	readonly tableId: string;
	readonly name: string;
	readonly presetId: string;
	readonly smallBlind: number;
	readonly bigBlind: number;
	readonly maxSeats: number;
	readonly playerCount: number;
	readonly handsPlayed: number;
}

export function listingOf(table: LobbyTable): LobbyListing {
	const preset = presetById(table.presetId);
	return {
		tableId: table.id,
		name: table.name,
		presetId: table.presetId,
		smallBlind: preset?.smallBlind ?? 0,
		bigBlind: preset?.bigBlind ?? 0,
		maxSeats: table.maxSeats,
		playerCount: table.players.length,
		handsPlayed: table.handsPlayed,
	};
}
