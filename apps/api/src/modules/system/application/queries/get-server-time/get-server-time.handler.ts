import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Clock } from "@/shared/application/clock.js";
import {
	GetServerTimeQuery,
	type ServerTime,
} from "./get-server-time.query.js";

@QueryHandler(GetServerTimeQuery)
export class GetServerTimeHandler implements IQueryHandler<GetServerTimeQuery> {
	constructor(private readonly clock: Clock) {}

	async execute(): Promise<ServerTime> {
		return { now: this.clock.now() };
	}
}
