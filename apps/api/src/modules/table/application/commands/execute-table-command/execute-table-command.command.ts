import { Command } from "@nestjs/cqrs";
import type { EventMetadata } from "@/shared/application/event-store.js";
import type { GameEvents } from "../../../domain/game.js";
import type { GameCommand } from "../../../domain/table-commands.js";

/**
 * A command a player, the lobby, a connection or a timer sends to a table. Hands are dealt by
 * `StartNextHandCommand`, and their decks revealed by the table's runtime.
 */
export type TableCommandInput = Exclude<
	GameCommand,
	{ type: "StartHand" | "RevealDeck" }
>;

/** Runs one command on a table, and answers the events it added to each stream. */
export class ExecuteTableCommand extends Command<GameEvents> {
	constructor(
		readonly tableId: string,
		readonly command: TableCommandInput,
		readonly metadata: EventMetadata = {},
	) {
		super();
	}
}
