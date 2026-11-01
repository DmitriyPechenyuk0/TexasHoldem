import { Command } from "@nestjs/cqrs";
import type { GameEvents } from "../../../domain/game.js";

/**
 * Deals the table's next hand if it can start now; answers its events, or null when it cannot
 * (a hand is running, or fewer than two players are ready), since a scheduled deal may find that.
 */
export class StartNextHandCommand extends Command<GameEvents | null> {
	constructor(readonly tableId: string) {
		super();
	}
}
