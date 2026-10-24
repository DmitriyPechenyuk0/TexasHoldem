import type { Problem } from "@holdem/shared";

/**
 * The api answered with an error. `code` (e.g. `table.seat-taken`) is what the UI translates,
 * with `problem.params` filled in; `problem.detail` is an English fallback.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(readonly problem: Problem) {
		super(
			`${problem.status} ${problem.code}${problem.detail ? `: ${problem.detail}` : ""}`,
		);
		this.name = "ApiError";
		this.status = problem.status;
		this.code = problem.code;
	}
}

/** The api could not be reached: offline, connection refused, DNS or CORS failure. */
export class NetworkError extends Error {
	readonly code = "network.unreachable";

	constructor(url: URL, options?: ErrorOptions) {
		super(`Could not reach ${url.origin}`, options);
		this.name = "NetworkError";
	}
}
