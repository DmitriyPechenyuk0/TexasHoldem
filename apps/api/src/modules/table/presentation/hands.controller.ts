import { HandId } from "@holdem/shared";
import type { HandFairnessResponse } from "@holdem/shared/contracts/table";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { ValidParam } from "@/shared/presentation/request-validation.js";
import { GetHandFairnessQuery } from "../application/queries/get-hand-fairness/get-hand-fairness.query.js";

/** Ended hands, for anyone to check (ADR-008): no session needed, nothing secret is left. */
@Controller("hands")
export class HandsController {
	constructor(private readonly queryBus: QueryBus) {}

	/** 404 `table.hand-not-found`; 409 `table.deck-not-revealed` while the hand is played. */
	@Get(":handId/fairness")
	fairness(
		@ValidParam("handId", HandId) handId: HandId,
	): Promise<HandFairnessResponse> {
		return this.queryBus.execute(new GetHandFairnessQuery(handId));
	}
}
