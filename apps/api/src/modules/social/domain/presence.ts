/** Where a player is, as one watcher may see it; the realtime contract's `Presence`. */
export type Presence =
	| { readonly status: "offline" }
	| { readonly status: "online" }
	/** At a table the watcher may not join, whose id stays hidden. */
	| { readonly status: "playing" }
	| { readonly status: "at-table"; readonly tableId: string };

/** Where a player is, as the server knows it. */
export interface Whereabouts {
	/** Shown online: connected, or disconnected for less than the grace period. */
	readonly online: boolean;
	/** The tables they sit at. */
	readonly tables: readonly string[];
}

export const NOWHERE: Whereabouts = { online: false, tables: [] };

/**
 * The player's presence as a watcher sees it. A player offline is offline wherever they sit; one
 * at tables shows the first the watcher may join, in id order, or just that they play.
 */
export function presenceFor(
	{ online, tables }: Whereabouts,
	mayJoin: ReadonlySet<string>,
): Presence {
	if (!online) {
		return { status: "offline" };
	}
	if (tables.length === 0) {
		return { status: "online" };
	}
	const visible = [...tables].sort().find((tableId) => mayJoin.has(tableId));
	return visible === undefined
		? { status: "playing" }
		: { status: "at-table", tableId: visible };
}
