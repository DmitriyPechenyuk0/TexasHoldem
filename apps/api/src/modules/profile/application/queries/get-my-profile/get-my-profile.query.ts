import type { UserId } from "@holdem/shared";
import type { MyProfileResponse } from "@holdem/shared/contracts/profile";
import { Query } from "@nestjs/cqrs";

export class GetMyProfileQuery extends Query<MyProfileResponse> {
	constructor(readonly userId: UserId) {
		super();
	}
}
