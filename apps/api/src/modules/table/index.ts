// The table context's public API for other modules: the command that reaches a table wherever
// it runs, the config a table opens with (the lobby picks it, the table enforces it), and the
// summary it publishes of each table and of each hand's winners.
export { ExecuteTableCommand } from "./application/commands/execute-table-command/execute-table-command.command.js";
export {
	type PotAward,
	PotsAwarded,
} from "./application/events/pots-awarded.event.js";
export { TableSummaryChanged } from "./application/events/table-summary-changed.event.js";
export {
	DEFAULT_ABSENCE_POLICY,
	type TableConfig,
} from "./domain/table-config.js";
