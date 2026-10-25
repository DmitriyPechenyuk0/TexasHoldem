import { MeResponse } from "@holdem/shared/contracts/identity";
import type { HttpClient } from "@/shared/api";

/** Gives the viewer's account its username, once; answers the account as stored. */
export async function chooseUsername(
	client: HttpClient,
	username: string,
): Promise<MeResponse> {
	return client.request("/me/username", {
		method: "PUT",
		body: { username },
		schema: MeResponse,
	});
}
