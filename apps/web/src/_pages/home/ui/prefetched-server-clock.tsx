import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { getQueryClient, serverTimeQuery } from "@/shared/api";
import { getServerHttp } from "@/shared/api/index.server";
import { ServerClock } from "./server-clock";

/** Fetches the server time while rendering, so the clock shows up in the HTML. */
export async function PrefetchedServerClock() {
	const queryClient = getQueryClient();
	// A failed fetch is not dehydrated, so the client fetches again and shows the error.
	await queryClient.query(serverTimeQuery(await getServerHttp())).catch(noop);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ServerClock />
		</HydrationBoundary>
	);
}
