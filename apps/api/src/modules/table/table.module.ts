import { type DynamicModule, Module } from "@nestjs/common";
import { EventStore } from "@/shared/application/event-store.js";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	type Database,
	DATABASE,
} from "@/shared/infrastructure/database/index.js";
import { PostgresEventStore } from "@/shared/infrastructure/event-store/index.js";
import { ExecuteTableCommandHandler } from "./application/commands/execute-table-command/execute-table-command.handler.js";
import { StartNextHandHandler } from "./application/commands/start-next-hand/start-next-hand.handler.js";
import { GetTableViewHandler } from "./application/queries/get-table-view/get-table-view.handler.js";
import { DeckProvider } from "./application/deck-provider.js";
import { TableRuntimeRegistry } from "./application/runtime/table-runtime-registry.js";
import { TableRuntimeOptions } from "./application/runtime/table-runtime-options.js";
import { tableEvents } from "./infrastructure/persistence/schema.js";
import { RandomDeckProvider } from "./infrastructure/random-deck-provider.js";
import { DevTablesController } from "./presentation/dev-tables.controller.js";
import { TableGateway } from "./presentation/table.gateway.js";

/** A table no command has reached for this long leaves memory; its streams stay in Postgres. */
const IDLE_MS = 10 * 60_000;

/**
 * Tables and the hands they run, event-sourced (ADR-002): seats, spectators and the deal, with
 * `@holdem/engine` deciding every hand. Each table runs in a runtime of its own, one command at a
 * time; players and spectators follow it on the `/table` namespace.
 */
@Module({})
export class TableModule {
	static forRoot(config: AppConfig): DynamicModule {
		return {
			module: TableModule,
			controllers: config.nodeEnv === "production" ? [] : [DevTablesController],
			providers: [
				{
					provide: EventStore,
					inject: [DATABASE],
					useFactory: (db: Database) => new PostgresEventStore(db, tableEvents),
				},
				{ provide: DeckProvider, useClass: RandomDeckProvider },
				{
					provide: TableRuntimeOptions,
					inject: [AppConfig],
					useFactory: (appConfig: AppConfig): TableRuntimeOptions => ({
						handPauseMs: appConfig.table.handPauseMs,
						idleMs: IDLE_MS,
					}),
				},
				TableRuntimeRegistry,
				ExecuteTableCommandHandler,
				StartNextHandHandler,
				GetTableViewHandler,
				TableGateway,
			],
		};
	}
}
