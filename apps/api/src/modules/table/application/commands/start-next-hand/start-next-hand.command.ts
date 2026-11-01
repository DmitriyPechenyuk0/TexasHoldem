import { Command } from "@nestjs/cqrs";
/**
 * Deals the table's next hand if it can start now; answers whether it did: it does not while a
 * hand is running or fewer than two players are ready, as a scheduled deal may find.
 */
export class StartNextHandCommand extends Command<boolean> {
	constructor(readonly tableId: string) {
		super();
	}
}
