import { ServerTimeResponse } from "@holdem/shared/contracts/system";
import { queryOptions } from "@tanstack/react-query";
import { http, type HttpClient } from "./http";

/** The server clock, for correcting the local one before rendering turn timers. */
export function fetchServerTime(
	client: HttpClient,
	signal?: AbortSignal,
): Promise<ServerTimeResponse> {
	return client.request("/system/time", { schema: ServerTimeResponse, signal });
}

/** Pass `getServerHttp()` when prefetching in a Server Component. */
export const serverTimeQuery = (client: HttpClient = http) =>
	queryOptions({
		queryKey: ["system", "time"],
		queryFn: ({ signal }) => fetchServerTime(client, signal),
	});
