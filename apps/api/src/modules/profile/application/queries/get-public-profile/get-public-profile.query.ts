import type { PublicProfileResponse } from "@holdem/shared/contracts/profile";
import { Query } from "@nestjs/cqrs";

/** By username, in any case. */
export class GetPublicProfileQuery extends Query<PublicProfileResponse> {
	constructor(readonly username: string) {
		super();
	}
}
