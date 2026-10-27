import type { Response } from "express";
import { HttpProblem } from "./problem.js";

/** The 429 for a refused request, with `Retry-After` set on the response. */
export function rateLimited(
	response: Response,
	retryAfterSeconds: number,
): HttpProblem {
	response.setHeader("Retry-After", String(retryAfterSeconds));
	return new HttpProblem(
		429,
		"request.rate-limited",
		"Too many attempts. Try again later.",
	);
}
