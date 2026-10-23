import { ServerTimeResponse } from "@holdem/shared/contracts/system";
import { publicEnv } from "@/shared/config";

/** The server clock, for correcting the local one before rendering turn timers. */
export async function fetchServerTime(): Promise<ServerTimeResponse> {
	const response = await fetch(new URL("/system/time", publicEnv.apiUrl));
	if (!response.ok) {
		throw new Error(`GET /system/time answered ${response.status}`);
	}
	return ServerTimeResponse.parse(await response.json());
}
