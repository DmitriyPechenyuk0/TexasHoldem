import type { TableView } from "@holdem/shared/realtime";
import type { EventMetadata } from "@/shared/application/event-store.js";
import type { TableCommandInput } from "./commands/execute-table-command/execute-table-command.command.js";

/**
 * What an instance asks the one that runs a table to do (ADR-004). Answers carry no hand events:
 * those hold the deck, which never leaves the instance that runs the hand.
 */
export type TableRequest =
	| {
			readonly kind: "execute";
			readonly tableId: string;
			readonly command: TableCommandInput;
			readonly metadata: EventMetadata;
	  }
	/** Answers whether a hand was dealt. */
	| { readonly kind: "deal"; readonly tableId: string }
	/** Answers the table as this user sees it (`TableView`). */
	| {
			readonly kind: "view";
			readonly tableId: string;
			readonly userId: string;
	  };

/** What each request answers. */
export interface TableReplies {
	readonly execute: undefined;
	readonly deal: boolean;
	readonly view: TableView;
}

/**
 * Port for requests between instances: a command for a table goes to the instance holding its
 * lease. A failure comes back as the error it was there: a `DomainError` with its kind, code and
 * params, or a plain error.
 */
export abstract class TableRequests {
	/** Sends the request to `instanceId` and answers its reply; throws once it takes too long. */
	abstract send<R extends TableRequest>(
		instanceId: string,
		request: R,
	): Promise<TableReplies[R["kind"]]>;

	/** Serves the requests other instances send this one. */
	abstract serve(
		handler: (
			request: TableRequest,
		) => Promise<TableReplies[TableRequest["kind"]]>,
	): void;
}
