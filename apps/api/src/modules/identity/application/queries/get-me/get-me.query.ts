import type { UserId } from "@holdem/shared";
import type { MeResponse } from "@holdem/shared/contracts/identity";
import { Query } from "@nestjs/cqrs";

export class GetMeQuery extends Query<MeResponse> {
	constructor(readonly userId: UserId) {
		super();
	}
}
