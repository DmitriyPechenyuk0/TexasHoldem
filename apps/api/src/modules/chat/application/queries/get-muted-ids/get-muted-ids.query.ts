import { Query } from "@nestjs/cqrs";

/** The ids the player muted: what the chat hides from them, sent when they join a chat. */
export class GetMutedIdsQuery extends Query<readonly string[]> {
	constructor(readonly userId: string) {
		super();
	}
}
