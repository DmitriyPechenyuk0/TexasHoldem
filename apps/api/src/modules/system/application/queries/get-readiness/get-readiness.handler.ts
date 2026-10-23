import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import {
	HEALTH_INDICATORS,
	HealthIndicator,
} from "@/shared/application/health-indicator.js";
import { GetReadinessQuery, type Readiness } from "./get-readiness.query.js";

/** A dependency that has not answered by then counts as down, so the probe itself never hangs. */
export const CHECK_TIMEOUT_MS = 2_000;

async function answersInTime(indicator: HealthIndicator): Promise<boolean> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
	});
	try {
		return await Promise.race([
			indicator.isHealthy().catch(() => false),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}
}

@QueryHandler(GetReadinessQuery)
export class GetReadinessHandler implements IQueryHandler<GetReadinessQuery> {
	constructor(
		@Inject(HEALTH_INDICATORS)
		private readonly indicators: readonly HealthIndicator[],
	) {}

	async execute(): Promise<Readiness> {
		const results = await Promise.all(
			this.indicators.map(
				async (indicator) =>
					[indicator.name, await answersInTime(indicator)] as const,
			),
		);
		return {
			ready: results.every(([, healthy]) => healthy),
			checks: Object.fromEntries(
				results.map(([name, healthy]) => [name, healthy ? "up" : "down"]),
			),
		};
	}
}
