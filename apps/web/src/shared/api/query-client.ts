import { environmentManager, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Data prefetched on the server is not fetched again right after hydration.
				staleTime: 60_000,
				// The same request gets the same 4xx again. Server prefetches never retry: a failed one
				// leaves the query to the client.
				retry: (failureCount, error) =>
					!environmentManager.isServer() &&
					!(error instanceof ApiError && error.status < 500) &&
					failureCount < 2,
			},
		},
	});
}

let browserQueryClient: QueryClient | undefined;

/**
 * A fresh client for every server render, so cached data never crosses requests; one client for
 * the whole browser session.
 */
export function getQueryClient(): QueryClient {
	if (environmentManager.isServer()) {
		return makeQueryClient();
	}
	browserQueryClient ??= makeQueryClient();
	return browserQueryClient;
}
