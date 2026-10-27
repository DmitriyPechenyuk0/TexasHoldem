import {
	LinkedAccountsResponse,
	type LinkSocialRequest,
} from "@holdem/shared/contracts/identity";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { http, type HttpClient } from "@/shared/api";

export const LINKED_ACCOUNTS_QUERY_KEY = ["linked-accounts"] as const;

/** The viewer's ways to sign in: `credential` is the password, the rest are providers. */
export const linkedAccountsQuery = (client: HttpClient = http) =>
	queryOptions({
		queryKey: LINKED_ACCOUNTS_QUERY_KEY,
		queryFn: ({ signal }) =>
			client.request("/auth/list-accounts", {
				schema: LinkedAccountsResponse,
				signal,
			}),
	});

const RedirectResponse = z.object({ url: z.url() });

/** The provider's page; on the way back the api adds that provider account to the viewer's. */
export async function startOAuthLink(
	client: HttpClient,
	body: LinkSocialRequest,
): Promise<string> {
	return (
		await client.request("/auth/link-social", {
			method: "POST",
			body,
			schema: RedirectResponse,
		})
	).url;
}

export async function unlinkAccount(
	client: HttpClient,
	accountId: string,
): Promise<void> {
	await client.request("/auth/unlink-account", {
		method: "POST",
		body: { accountId },
		schema: z.object({ status: z.boolean() }),
	});
}
