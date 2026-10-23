import { Query } from "@nestjs/cqrs";

export interface ServerTime {
	readonly now: Date;
}

/** Current server time, so clients can correct their clock before rendering turn timers. */
export class GetServerTimeQuery extends Query<ServerTime> {}
