import type { HandFairnessResponse } from "@holdem/shared/contracts/table";
import { Query } from "@nestjs/cqrs";

/** What anyone needs to check an ended hand's deal against its commitment (ADR-008). */
export class GetHandFairnessQuery extends Query<HandFairnessResponse> {
	constructor(readonly handId: string) {
		super();
	}
}
