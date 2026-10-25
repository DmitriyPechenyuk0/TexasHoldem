import {
	OAuthProvidersResponse,
	type OAuthProvider,
	type SignInSocialRequest,
} from "@holdem/shared/contracts/identity";
import { z } from "zod";
import type { HttpClient } from "@/shared/api";

const RedirectResponse = z.object({ url: z.url() });

/**
 * The providers the api has keys for. None when it cannot tell: the page then offers the
 * password form alone, which reports the failure itself.
 */
export async function fetchOAuthProviders(
	client: HttpClient,
): Promise<readonly OAuthProvider[]> {
	try {
		return (
			await client.request("/oauth-providers", {
				schema: OAuthProvidersResponse,
			})
		).providers;
	} catch {
		return [];
	}
}

/** The provider's page to send the browser to; it comes back to one of the request's URLs. */
export async function startOAuthSignIn(
	client: HttpClient,
	body: SignInSocialRequest,
): Promise<string> {
	return (
		await client.request("/auth/sign-in/social", {
			method: "POST",
			body,
			schema: RedirectResponse,
		})
	).url;
}
