import { type DynamicModule, Module } from "@nestjs/common";
import { EventStore } from "@/shared/application/event-store.js";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import {
	type Database,
	DATABASE,
} from "@/shared/infrastructure/database/index.js";
import { PostgresEventStore } from "@/shared/infrastructure/event-store/index.js";
import { ConnectToTableHandler } from "./application/commands/connect-to-table/connect-to-table.handler.js";
import { DisconnectFromTableHandler } from "./application/commands/disconnect-from-table/disconnect-from-table.handler.js";
import { PublishPotsAwardedHandler } from "./application/events/publish-pots-awarded.handler.js";
import { PublishTableSummaryHandler } from "./application/events/publish-table-summary.handler.js";
import { ExecuteTableCommandHandler } from "./application/commands/execute-table-command/execute-table-command.handler.js";
import { StartNextHandHandler } from "./application/commands/start-next-hand/start-next-hand.handler.js";
import { GetHandFairnessHandler } from "./application/queries/get-hand-fairness/get-hand-fairness.handler.js";
import { GetTableViewHandler } from "./application/queries/get-table-view/get-table-view.handler.js";
import { DeckProvider } from "./application/deck-provider.js";
import { TableRuntimeRegistry } from "./application/runtime/table-runtime-registry.js";
import { TableRuntimeOptions } from "./application/runtime/table-runtime-options.js";
import { TableLeases } from "./application/table-leases.js";
import { TablePresence } from "./application/table-presence.js";
import { TableRequests } from "./application/table-requests.js";
import { UnfinishedTables } from "./application/unfinished-tables.js";
import { tableEvents } from "./infrastructure/persistence/schema.js";
import { PostgresUnfinishedTables } from "./infrastructure/persistence/postgres-unfinished-tables.js";
import { RedisTableLeases } from "./infrastructure/redis-table-leases.js";
import { RedisTablePresence } from "./infrastructure/redis-table-presence.js";
import { RedisTableRequests } from "./infrastructure/redis-table-requests.js";
import { SeededDeckProvider } from "./infrastructure/seeded-deck-provider.js";
import { DevTablesController } from "./presentation/dev-tables.controller.js";
import { HandsController } from "./presentation/hands.controller.js";
import { TableGateway } from "./presentation/table.gateway.js";

/** A table no command has reached for this long leaves memory; its streams stay in Postgres. */
const IDLE_MS = 10 * 60_000;

/**
 * Tables and the hands they run, event-sourced (ADR-002): seats, spectators and the deal, with
 * `@holdem/engine` deciding every hand. Each table runs in a runtime of its own, one command at a
 * time, on the one instance holding its lease (ADR-004), which the others send its commands to;
 * players and spectators follow it on the `/table` namespace, and who still does is kept in Redis.
 */
@Module({})
export class TableModule {
	static forRoot(config: AppConfig): DynamicModule {
		return {
			module: TableModule,
			controllers:
				config.nodeEnv === "production"
					? [HandsController]
					: [HandsController, DevTablesController],
			providers: [
				{
					provide: EventStore,
					inject: [DATABASE],
					useFactory: (db: Database) => new PostgresEventStore(db, tableEvents),
				},
				{ provide: DeckProvider, useClass: SeededDeckProvider },
				{ provide: TablePresence, useClass: RedisTablePresence },
				{ provide: TableLeases, useClass: RedisTableLeases },
				{ provide: TableRequests, useClass: RedisTableRequests },
				{ provide: UnfinishedTables, useClass: PostgresUnfinishedTables },
				{
					provide: TableRuntimeOptions,
					inject: [AppConfig],
					useFactory: (appConfig: AppConfig): TableRuntimeOptions => ({
						handPauseMs: appConfig.table.handPauseMs,
						idleMs: IDLE_MS,
						leaseTtlMs: appConfig.table.leaseTtlMs,
					}),
				},
				TableRuntimeRegistry,
				ExecuteTableCommandHandler,
				StartNextHandHandler,
				ConnectToTableHandler,
				DisconnectFromTableHandler,
				GetTableViewHandler,
				GetHandFairnessHandler,
				PublishTableSummaryHandler,
				PublishPotsAwardedHandler,
				TableGateway,
			],
		};
	}
}
