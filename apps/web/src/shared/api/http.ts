import { Problem, PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import type { z } from "zod";
import { publicEnv } from "@/shared/config";
import { ApiError, NetworkError } from "./errors";

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
	/** `path` starts at the api root, e.g. `/system/time`. */
	request<Schema extends z.ZodType>(
		path: string,
		options: RequestOptions<Schema>,
	): Promise<z.output<Schema>>;
}

export interface HttpClientConfig {
	/** The api origin. */
	readonly baseUrl: string;
	/** Sent with every request, e.g. the cookie the server forwards. */
	readonly headers?: Readonly<Record<string, string>>;
}

/**
 * A fetch wrapper for the api: sends the session cookie, parses the answer with its contract and
 * throws `ApiError` for error answers, `NetworkError` when the api cannot be reached.
 */
export function createHttpClient({
	baseUrl,
	headers = {},
}: HttpClientConfig): HttpClient {
	return {
		async request(path, { method = "GET", schema, body, query, signal }) {
			const url = new URL(path, baseUrl);
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

			let response: Response;
			try {
				response = await fetch(url, {
					method,
					headers: requestHeaders,
					body: body === undefined ? undefined : JSON.stringify(body),
					credentials: "include",
					signal,
				});
			} catch (error) {
				// A cancelled request (e.g. TanStack Query dropping a stale fetch) is not a network failure.
				if (signal?.aborted) {
					throw error;
				}
				throw new NetworkError(url, { cause: error });
			}

			if (!response.ok) {
				throw await apiErrorOf(response);
			}
			const data = response.status === 204 ? undefined : await response.json();
			const result = schema.safeParse(data);
			if (!result.success) {
				throw new Error(
					`${method} ${url.pathname} answered outside its contract`,
					{ cause: result.error },
				);
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
