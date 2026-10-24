import type {
	LivenessResponse,
	ReadinessResponse,
} from "@holdem/shared/contracts/system";
import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import { GetReadinessQuery } from "../application/queries/get-readiness/get-readiness.query.js";

@Controller("health")
export class HealthController {
	constructor(private readonly queryBus: QueryBus) {}

	/** Liveness: the process serves HTTP. It never touches a dependency, so an outage does not restart the API. */
	@Get()
	getLiveness(): LivenessResponse {
		return { status: "ok" };
	}

	/**
	 * Readiness: every dependency answers. A 503 tells the load balancer to route elsewhere; it is
	 * a regular answer with the readiness body, not an error, so it does not go through the problem filter.
	 */
	@Get("ready")
	async getReadiness(
		@Res({ passthrough: true }) response: Response,
	): Promise<ReadinessResponse> {
		const { ready, checks } = await this.queryBus.execute(
			new GetReadinessQuery(),
		);
		response.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
		return { status: ready ? "ready" : "not-ready", checks };
	}
}
