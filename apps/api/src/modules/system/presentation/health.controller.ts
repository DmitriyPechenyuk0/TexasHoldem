import type {
	LivenessResponse,
	ReadinessResponse,
} from "@holdem/shared/contracts/system";
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { GetReadinessQuery } from "../application/queries/get-readiness/get-readiness.query.js";

@Controller("health")
export class HealthController {
	constructor(private readonly queryBus: QueryBus) {}

	/** Liveness: the process serves HTTP. It never touches a dependency, so an outage does not restart the API. */
	@Get()
	getLiveness(): LivenessResponse {
		return { status: "ok" };
	}

	/** Readiness: every dependency answers. A 503 tells the load balancer to route elsewhere. */
	@Get("ready")
	async getReadiness(): Promise<ReadinessResponse> {
		const { ready, checks } = await this.queryBus.execute(
			new GetReadinessQuery(),
		);
		const body: ReadinessResponse = {
			status: ready ? "ready" : "not-ready",
			checks,
		};
		if (!ready) {
			throw new ServiceUnavailableException(body);
		}
		return body;
	}
}
