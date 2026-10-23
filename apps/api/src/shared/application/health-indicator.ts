/** Port for one dependency the API needs to serve traffic. Adapters live next to their clients. */
export abstract class HealthIndicator {
	/** Key in the readiness report, e.g. `database`. */
	abstract readonly name: string;
	/** Whether the dependency answers right now. Resolves to false instead of throwing. */
	abstract isHealthy(): Promise<boolean>;
}

/** Every registered `HealthIndicator`, as an array. */
export const HEALTH_INDICATORS = Symbol("HealthIndicators");
