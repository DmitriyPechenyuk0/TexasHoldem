import { MeResponse } from "@holdem/shared/contracts/identity";
import { queryOptions } from "@tanstack/react-query";
import { ApiError, http, type HttpClient } from "@/shared/api";

/** The signed-in user, or null without a session (an expired or revoked one included). */
export type Viewer = MeResponse;

export async function fetchViewer(
	client: HttpClient,
	signal?: AbortSignal,
): Promise<Viewer | null> {
	try {
		return await client.request("/me", { schema: MeResponse, signal });
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) {
			return null;
		}
		throw error;
	}
}

export const VIEWER_QUERY_KEY = ["viewer"] as const;

/** Pass `getServerHttp()` when prefetching in a Server Component. */
export const viewerQuery = (client: HttpClient = http) =>
	queryOptions({
		queryKey: VIEWER_QUERY_KEY,
		queryFn: ({ signal }) => fetchViewer(client, signal),
	});
