import { randomUUID } from "node:crypto";
import type { OAuthProvider } from "@holdem/shared/contracts/identity";
import type { OAuthClient } from "@/shared/infrastructure/config/index.js";

// Google, GitHub and Discord as Better Auth talks to them, in process: their token and profile
// endpoints answer from `fetch`, every other request goes to the network as usual.

/** Who signs in at the provider. `handle` is the GitHub login or the Discord username. */
export interface ProviderUser {
	readonly id: string;
	readonly email: string;
	readonly emailVerified?: boolean;
	readonly handle?: string;
	readonly name?: string;
}

/** Keys for every provider, for `config.auth.oauth`. */
export const FAKE_OAUTH_CLIENTS: Record<OAuthProvider, OAuthClient> = {
	google: { clientId: "google-client", clientSecret: "google-secret" },
	github: { clientId: "github-client", clientSecret: "github-secret" },
	discord: { clientId: "discord-client", clientSecret: "discord-secret" },
};

const TOKEN_ENDPOINTS: Record<string, OAuthProvider> = {
	"https://oauth2.googleapis.com/token": "google",
	"https://github.com/login/oauth/access_token": "github",
	"https://discord.com/api/oauth2/token": "discord",
};

const base64url = (value: object) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

async function requestOf(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<{ url: string; body: string; authorization: string | null }> {
	if (input instanceof Request) {
		return {
			url: input.url,
			body: await input.clone().text(),
			authorization: input.headers.get("authorization"),
		};
	}
	return {
		url: String(input),
		// Better Auth sends token requests as URLSearchParams.
		body: init?.body instanceof URLSearchParams ? init.body.toString() : "",
		authorization: new Headers(init?.headers).get("authorization"),
	};
}

export class FakeOAuth {
	/** Authorization codes, then access tokens, by the user they stand for. */
	private readonly codes = new Map<string, ProviderUser>();
	private readonly tokens = new Map<string, ProviderUser>();
	/** Token requests the providers received, by provider. */
	readonly tokenRequests: OAuthProvider[] = [];

	/** Takes over `fetch` for the providers' hosts until the test file's mocks are restored. */
	install(): this {
		const network = globalThis.fetch;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = await requestOf(input, init);
			return (await this.answer(request)) ?? network(input, init);
		});
		return this;
	}

	/** What the provider hands back after `user` consents: the `code` of the callback. */
	consent(user: ProviderUser): string {
		const code = `code-${randomUUID()}`;
		this.codes.set(code, user);
		return code;
	}

	private async answer({
		url,
		body,
		authorization,
	}: Awaited<ReturnType<typeof requestOf>>): Promise<Response | undefined> {
		const provider = TOKEN_ENDPOINTS[url];
		if (provider) {
			this.tokenRequests.push(provider);
			const user = this.codes.get(new URLSearchParams(body).get("code") ?? "");
			if (!user) {
				return json({ error: "invalid_grant" }, 400);
			}
			const accessToken = `token-${randomUUID()}`;
			this.tokens.set(accessToken, user);
			return json({
				access_token: accessToken,
				token_type: "Bearer",
				expires_in: 3600,
				scope: "openid email profile",
				// Better Auth reads Google's profile from the ID token it got from Google directly.
				...(provider === "google" && {
					id_token: `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
						iss: "https://accounts.google.com",
						aud: FAKE_OAUTH_CLIENTS.google.clientId,
						sub: user.id,
						email: user.email,
						email_verified: user.emailVerified ?? true,
						name: user.name,
					})}.signature`,
				}),
			});
		}

		const user = this.tokens.get(authorization?.replace(/^Bearer /i, "") ?? "");
		// Discord's `@me` arrives encoded.
		switch (decodeURIComponent(url)) {
			case "https://api.github.com/user":
				return user
					? json({
							id: Number(user.id),
							login: user.handle,
							name: user.name ?? null,
							// GitHub leaves a private email out; Better Auth then asks /user/emails.
							email: null,
							avatar_url: "https://avatars.example.test/u/1",
						})
					: json({ message: "Bad credentials" }, 401);
			case "https://api.github.com/user/emails":
				return json(
					user
						? [
								{
									email: user.email,
									primary: true,
									verified: user.emailVerified ?? true,
								},
							]
						: [],
				);
			case "https://discord.com/api/users/@me":
				return user
					? json({
							id: user.id,
							username: user.handle,
							global_name: user.name ?? null,
							discriminator: "0",
							avatar: null,
							email: user.email,
							verified: user.emailVerified ?? true,
						})
					: json({ message: "401: Unauthorized" }, 401);
			default:
				return undefined;
		}
	}
}
