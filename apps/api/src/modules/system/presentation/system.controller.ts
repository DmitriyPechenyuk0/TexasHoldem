import type { ServerTimeResponse } from "@holdem/shared/contracts/system";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { GetServerTimeQuery } from "../application/queries/get-server-time/get-server-time.query.js";

@Controller("system")
export class SystemController {
	constructor(private readonly queryBus: QueryBus) {}

	@Get("time")
	async getServerTime(): Promise<ServerTimeResponse> {
		const { now } = await this.queryBus.execute(new GetServerTimeQuery());
		return { now: now.toISOString() };
	}
}
