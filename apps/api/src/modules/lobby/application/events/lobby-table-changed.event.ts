import type { LobbyTable } from "../../domain/lobby-table.js";

/** A listed table changed in the lobby's read model: this process tells whoever watches the lobby. */
export class LobbyTableChanged {
	constructor(readonly table: LobbyTable) {}
}
