import type { Decider } from "@/shared/domain/decider.js";
import { decideTable } from "./decide-table.js";
import { evolveTable } from "./evolve-table.js";
import type { TableCommand } from "./table-commands.js";
import type { TableError } from "./table-errors.js";
import type { TableEvent } from "./table-events.js";
import { initialTableState, type TableState } from "./table-state.js";

/** The table as one value, for the event-sourcing helpers (`loadDecider`, `saveDecider`). */
export const tableDecider: Decider<
	TableCommand,
	TableState,
	TableEvent,
	TableError
> = {
	decide: decideTable,
	evolve: evolveTable,
	initialState: initialTableState,
};
