import { Query } from "@nestjs/cqrs";

export type DependencyStatus = "up" | "down";

export interface Readiness {
	readonly ready: boolean;
	/** Status per dependency, keyed by `HealthIndicator.name`. */
	readonly checks: Readonly<Record<string, DependencyStatus>>;
}

/** Whether every dependency answers, so a load balancer knows if this instance can take traffic. */
export class GetReadinessQuery extends Query<Readiness> {}
