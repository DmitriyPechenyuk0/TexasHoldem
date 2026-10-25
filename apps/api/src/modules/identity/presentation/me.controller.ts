import type { MeResponse } from "@holdem/shared/contracts/identity";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { GetMeQuery } from "../application/queries/get-me/get-me.query.js";

@Controller("me")
export class MeController {
	constructor(private readonly queryBus: QueryBus) {}

	@Get()
	@UseGuards(AuthGuard)
	me(@CurrentUser() viewer: Viewer): Promise<MeResponse> {
		return this.queryBus.execute(new GetMeQuery(viewer.userId));
	}
}
