import { z } from "zod";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/** One invalid part of a request, listed in a 400 problem. */
export const ProblemFieldError = z.object({
	path: z.array(z.union([z.string(), z.number()])),
	message: z.string(),
});
export type ProblemFieldError = z.infer<typeof ProblemFieldError>;

/**
 * Body of every error response: RFC 9457 problem details, served as `application/problem+json`.
 * `code` is the stable, machine-readable id clients switch on, such as `table.seat-taken`;
 * `title` and `detail` are for people and may change.
 */
export const Problem = z.object({
	type: z.string(),
	title: z.string(),
	status: z.int().min(400).max(599),
	detail: z.string().optional(),
	instance: z.string().optional(),
	code: z.string(),
	errors: z.array(ProblemFieldError).optional(),
});
export type Problem = z.infer<typeof Problem>;
