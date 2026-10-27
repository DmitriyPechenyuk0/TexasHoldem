import { API_PREFIX, Problem, PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import type { z } from "zod";
import { publicEnv } from "@/shared/config";
import { ApiError, NetworkError, RequestTimeoutError } from "./errors";

/** How long a request may take, answer included, before it fails with `RequestTimeoutError`. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryParams = Readonly<
	Record<string, string | number | boolean | undefined>
>;

export interface RequestOptions<Schema extends z.ZodType> {
	readonly method?: HttpMethod;
	/** The response body's contract; `z.undefined()` for a 204. */
	readonly schema: Schema;
	/** Sent as JSON. */
	readonly body?: unknown;
	/** Undefined values are left out. */
	readonly query?: QueryParams;
	readonly signal?: AbortSignal;
}

export interface HttpClient {
	/** `path` starts at the api root, e.g. `/system/time` for `GET /api/system/time`. */
	request<Schema extends z.ZodType>(
		path: string,
		options: RequestOptions<Schema>,
	): Promise<z.output<Schema>>;
}

export interface HttpClientConfig {
	/** The api origin; every path is resolved under its `/api` prefix. */
	readonly baseUrl: string;
	/** Sent with every request, e.g. the cookie the server forwards. */
	readonly headers?: Readonly<Record<string, string>>;
	/** Defaults to `DEFAULT_TIMEOUT_MS`, so a stalled api never hangs a render or a query. */
	readonly timeoutMs?: number;
}

/**
 * A fetch wrapper for the api: sends the session cookie, parses the answer with its contract and
 * throws `ApiError` for error answers, `NetworkError` when the api cannot be reached and
 * `RequestTimeoutError` when it does not answer in time.
 */
export function createHttpClient({
	baseUrl,
	headers = {},
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: HttpClientConfig): HttpClient {
	return {
		async request(path, { method = "GET", schema, body, query, signal }) {
			const url = new URL(`${API_PREFIX}${path}`, baseUrl);
			for (const [name, value] of Object.entries(query ?? {})) {
				if (value !== undefined) {
					url.searchParams.set(name, String(value));
				}
			}
			const requestHeaders = new Headers(headers);
			requestHeaders.set("accept", `application/json, ${PROBLEM_CONTENT_TYPE}`);
			if (body !== undefined) {
				requestHeaders.set("content-type", "application/json");
			}

			const outsideContract = (cause: unknown) =>
				new Error(`${method} ${url.pathname} answered outside its contract`, {
					cause,
				});
			const timeout = AbortSignal.timeout(timeoutMs);

			let data: unknown;
			try {
				const response = await fetch(url, {
					method,
					headers: requestHeaders,
					body: body === undefined ? undefined : JSON.stringify(body),
					credentials: "include",
					signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
				});
				if (!response.ok) {
					throw await apiErrorOf(response);
				}
				data = response.status === 204 ? undefined : await response.json();
			} catch (error) {
				// A cancelled request (e.g. TanStack Query dropping a stale fetch) is not a network failure.
				if (error instanceof ApiError || signal?.aborted) {
					throw error;
				}
				if (timeout.aborted) {
					throw new RequestTimeoutError(url, timeoutMs, { cause: error });
				}
				if (error instanceof SyntaxError) {
					throw outsideContract(error);
				}
				throw new NetworkError(url, { cause: error });
			}

			const result = schema.safeParse(data);
			if (!result.success) {
				throw outsideContract(result.error);
			}
			return result.data;
		},
	};
}

async function apiErrorOf(response: Response): Promise<ApiError> {
	if (response.headers.get("content-type")?.startsWith(PROBLEM_CONTENT_TYPE)) {
		const problem = Problem.safeParse(
			await response.json().catch(() => undefined),
		);
		if (problem.success) {
			return new ApiError(problem.data);
		}
	}
	// Not an answer from the api's error filter, e.g. a proxy in front of it answering 502.
	return new ApiError({
		type: "about:blank",
		title: response.statusText || "Error",
		status: response.status,
		code: `http.${response.status}`,
	});
}

/** The client for Client Components. Server Components use `getServerHttp`, which forwards the cookie. */
export const http = createHttpClient({ baseUrl: publicEnv.apiUrl });
