import { z } from "zod";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/** One invalid part of a request, listed in a 400 problem. */
export const ProblemFieldError = z.object({
	/** Location inside the body, query or route params, e.g. `["seats", 0]`. */
	path: z.array(z.union([z.string(), z.number()])),
	/** zod's issue code (`too_small`, `invalid_type`, …), stable enough to translate. */
	code: z.string(),
	message: z.string(),
});
export type ProblemFieldError = z.infer<typeof ProblemFieldError>;

/**
 * Body of every error response: RFC 9457 problem details, served as `application/problem+json`.
 * Clients translate `code` (e.g. `table.seat-taken`) with `params` filled in; `title` and
 * `detail` are English fallbacks for people and may change.
 */
export const Problem = z.object({
	type: z.string(),
	title: z.string(),
	status: z.int().min(400).max(599),
	detail: z.string().optional(),
	/** The request path the problem occurred on. */
	instance: z.string().optional(),
	code: z.string(),
	params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
	errors: z.array(ProblemFieldError).optional(),
	/** Matches `requestId` in the server logs. */
	requestId: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;
