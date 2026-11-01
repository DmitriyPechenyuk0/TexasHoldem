// The table context's public API for other modules: the command that reaches a table wherever
// it runs, and the config a table opens with (the lobby picks it, the table enforces it).
export { ExecuteTableCommand } from "./application/commands/execute-table-command/execute-table-command.command.js";
export {
	DEFAULT_ABSENCE_POLICY,
	type TableConfig,
} from "./domain/table-config.js";
