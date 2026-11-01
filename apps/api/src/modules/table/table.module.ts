import { Module } from "@nestjs/common";
import { EventStore } from "@/shared/application/event-store.js";
import {
	type Database,
	DATABASE,
} from "@/shared/infrastructure/database/index.js";
import { PostgresEventStore } from "@/shared/infrastructure/event-store/index.js";
import { ExecuteTableCommandHandler } from "./application/commands/execute-table-command/execute-table-command.handler.js";
import { StartNextHandHandler } from "./application/commands/start-next-hand/start-next-hand.handler.js";
import { DeckProvider } from "./application/deck-provider.js";
import { HandScheduler } from "./application/hand-scheduler.js";
import { RandomDeckProvider } from "./infrastructure/random-deck-provider.js";
import { tableEvents } from "./infrastructure/persistence/schema.js";
import { TimerHandScheduler } from "./infrastructure/timer-hand-scheduler.js";

/**
 * Tables and the hands they run, event-sourced (ADR-002): seats, spectators and the deal, with
 * `@holdem/engine` deciding every hand. The runtime and the gateway come with POK-77 and POK-82.
 */
@Module({
	providers: [
		{
			provide: EventStore,
			inject: [DATABASE],
			useFactory: (db: Database) => new PostgresEventStore(db, tableEvents),
		},
		{ provide: DeckProvider, useClass: RandomDeckProvider },
		{ provide: HandScheduler, useClass: TimerHandScheduler },
		ExecuteTableCommandHandler,
		StartNextHandHandler,
	],
})
export class TableModule {}
