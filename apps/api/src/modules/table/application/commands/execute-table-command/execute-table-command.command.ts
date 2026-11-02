import { Command } from "@nestjs/cqrs";
import type { EventMetadata } from "@/shared/application/event-store.js";
import type { GameCommand } from "../../../domain/table-commands.js";

/**
 * A command a player, the lobby, an admin, a connection or a timer sends to a table. Hands are dealt by
 * `StartNextHandCommand`, and their decks revealed by the table's runtime.
 */
export type TableCommandInput = Exclude<
	GameCommand,
	{ type: "StartHand" | "RevealDeck" }
>;

/**
 * Runs one command on a table, on the instance that runs it, and answers once it is stored; its
 * events reach the table's followers (`TableChanged`).
 */
export class ExecuteTableCommand extends Command<void> {
	constructor(
		readonly tableId: string,
		readonly command: TableCommandInput,
		readonly metadata: EventMetadata = {},
	) {
		super();
	}
}
