import { z } from "zod";

/** `GET /api/health`: the process serves HTTP. */
export const LivenessResponse = z.object({ status: z.literal("ok") });
export type LivenessResponse = z.infer<typeof LivenessResponse>;

export const DependencyStatus = z.enum(["up", "down"]);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

/** `GET /api/health/ready`: 200 when every dependency answers, 503 with the same body otherwise. */
export const ReadinessResponse = z.object({
	status: z.enum(["ready", "not-ready"]),
	checks: z.record(z.string(), DependencyStatus),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponse>;
