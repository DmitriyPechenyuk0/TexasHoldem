import {
	LinkedAccountsResponse,
	MeResponse,
	type OAuthProvider,
} from "@holdem/shared/contracts/identity";
import {
	Controller,
	Get,
	type INestApplication,
	UseGuards,
} from "@nestjs/common";
import { EventBus, type IEvent } from "@nestjs/cqrs";
import { eq } from "drizzle-orm";
import type { Subscription } from "rxjs";
import type { App } from "supertest/types.js";
import { UserRegistered, UserVerified } from "@/modules/identity/index.js";
import {
	accounts,
	sessions,
	users,
} from "@/modules/identity/infrastructure/persistence/schema.js";
import { profiles } from "@/modules/profile/infrastructure/persistence/schema.js";
import { AuthGuard } from "@/shared/presentation/auth.guard.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import {
	FAKE_OAUTH_CLIENTS,
	FakeOAuth,
	type ProviderUser,
} from "./support/fake-oauth.js";
import {
	type Browser,
	browser,
	problemOf,
	signUpAndVerify,
	verificationLinkFor,
	WEB_ORIGIN,
} from "./support/identity.js";
import {
	createTestDatabase,
	type TestDatabase,
} from "./support/test-database.js";

/** A route only players may reach, like the play endpoints to come. */
@Controller("probe")
class PlayersOnlyController {
	@Get("players-only")
	@UseGuards(AuthGuard, RequirePlayer)
	enter() {
		return { ok: true };
	}
}

const HOME = `${WEB_ORIGIN}/en`;
const CHOOSE_USERNAME = `${WEB_ORIGIN}/en/choose-username`;
const SIGN_IN = `${WEB_ORIGIN}/en/sign-in`;
/** Where a failure goes when the state, which holds `errorCallbackURL`, is missing or forged. */
const ANY_SIGN_IN = `${WEB_ORIGIN}/sign-in`;
const SETTINGS = `${WEB_ORIGIN}/en/settings`;

let lastProviderId = 1000;

/** Someone at the provider, unique per call. */
const providerUser = (user: Partial<ProviderUser> = {}): ProviderUser => {
	const id = String(++lastProviderId);
	return {
		id,
		email: `oauth.${id}.${Date.now()}@example.test`,
		name: "Ada Lovelace",
		...user,
	};
};

describe("OAuth sign-in and account linking (e2e)", () => {
	let database: TestDatabase;
	let app: INestApplication<App>;
	let events: IEvent[];
	let subscription: Subscription;
	const providers = new FakeOAuth();

	beforeAll(async () => {
		providers.install();
		database = await createTestDatabase();
		app = await createTestApp({
			config: {
				database: { url: database.url },
				trustProxy: "loopback",
				auth: { ...exampleConfig().auth, oauth: FAKE_OAUTH_CLIENTS },
			},
			controllers: [PlayersOnlyController],
		});
		events = [];
		subscription = app.get(EventBus).subscribe((event) => events.push(event));
	});

	afterAll(async () => {
		subscription?.unsubscribe();
		await app?.close();
		await database?.drop();
		vi.restoreAllMocks();
	});

	const eventsOf = (userId: string) =>
		events.filter((event) => (event as { userId?: string }).userId === userId);

	/**
	 * The whole redirect flow: the web app asks for the provider's page, the user consents there,
	 * and the provider sends the browser back to the api's callback. Answers that last redirect.
	 */
	async function signInWith(
		client: Browser,
		provider: OAuthProvider,
		user: ProviderUser,
		{ link = false, locale }: { link?: boolean; locale?: string } = {},
	) {
		const start = await client
			.post(link ? "/api/auth/link-social" : "/api/auth/sign-in/social", {
				provider,
				callbackURL: link ? "/en/settings" : "/en",
				newUserCallbackURL: "/en/choose-username",
				errorCallbackURL: link ? "/en/settings" : "/en/sign-in",
				locale,
			})
			.expect(200);
		const authorization = new URL(start.body.url);
		expect(authorization.searchParams.get("redirect_uri")).toBe(
			`${exampleConfig().apiOrigin}/api/auth/callback/${provider}`,
		);
		const query = new URLSearchParams({
			code: providers.consent(user),
			state: authorization.searchParams.get("state")!,
		});
		return client.get(`/api/auth/callback/${provider}?${query}`).expect(302);
	}

	const meOf = async (client: Browser) =>
		MeResponse.parse((await client.get("/api/me").expect(200)).body);

	const linkedProviders = async (client: Browser) =>
		LinkedAccountsResponse.parse(
			(await client.get("/api/auth/list-accounts").expect(200)).body,
		)
			.map((account) => account.providerId)
			.sort();

	it("lists the providers that have keys", async () => {
		const response = await browser(app).get("/api/oauth-providers").expect(200);

		expect(response.body).toEqual({
			providers: ["google", "github", "discord"],
		});
	});

	describe("a first sign-in", () => {
		it.each<[OAuthProvider, string]>([
			["github", "Octo_Cat"],
			["discord", "pixel_wizard"],
		])(
			"with %s creates a playable account named after the handle %s",
			async (provider, handle) => {
				const client = browser(app);
				const user = providerUser({
					handle: `${handle}${lastProviderId}`.slice(0, 20),
				});

				const callback = await signInWith(client, provider, user, {
					locale: "ru",
				});

				// A new account goes to newUserCallbackURL; the web app moves on from there.
				expect(callback.headers.location).toBe(CHOOSE_USERNAME);
				const me = await meOf(client);
				expect(me).toMatchObject({
					username: user.handle!.toLowerCase(),
					email: user.email,
					emailVerified: true,
					locale: "ru",
				});
				expect(eventsOf(me.id)).toEqual([
					new UserRegistered(me.id, me.username!, "ru"),
					new UserVerified(me.id),
				]);
				await client.get("/api/probe/players-only").expect(200);
				const [stored] = await database.db
					.select({ name: users.name, image: users.image })
					.from(users)
					.where(eq(users.id, me.id));
				// `name` mirrors the username; the provider's avatar is not kept.
				expect(stored).toEqual({ name: me.username, image: null });
			},
		);

		it.each<[string, OAuthProvider, () => Promise<string | undefined>]>([
			["Google, which has no handle", "google", async () => undefined],
			["an invalid handle", "github", async () => "octo-cat"],
			[
				"a handle another account has",
				"discord",
				async () => (await signUpAndVerify(browser(app))).username,
			],
		])(
			"with %s leaves the username to choose, and the account cannot play until then",
			async (_case, provider, handleOf) => {
				const client = browser(app);
				const user = providerUser({ handle: await handleOf() });

				await signInWith(client, provider, user, { locale: "ru" });

				const me = await meOf(client);
				expect(me).toMatchObject({ username: null, emailVerified: true });
				// Not announced yet: no profile, no events.
				expect(eventsOf(me.id)).toEqual([]);
				const refused = await client.get("/api/probe/players-only").expect(403);
				expect(problemOf(refused).code).toBe("auth.username-required");
				const [stored] = await database.db
					.select({ name: users.name })
					.from(users)
					.where(eq(users.id, me.id));
				// Emails greet by the provider's name until then.
				expect(stored?.name).toBe("Ada Lovelace");
			},
		);

		it("gets a verification email when the provider has not verified the address", async () => {
			const client = browser(app);
			const user = providerUser({
				handle: `unverified_${lastProviderId}`,
				emailVerified: false,
			});

			await signInWith(client, "github", user);

			const me = await meOf(client);
			expect(me.emailVerified).toBe(false);
			expect(eventsOf(me.id)).toEqual([
				new UserRegistered(me.id, me.username!, "en"),
			]);
			const refused = await client.get("/api/probe/players-only").expect(403);
			expect(problemOf(refused).code).toBe("auth.email-not-verified");
			await verificationLinkFor(user.email);

			// Verified at the provider later: the next sign-in brings it over and announces it.
			const again = browser(app);
			await signInWith(again, "github", { ...user, emailVerified: true });
			expect((await meOf(again)).emailVerified).toBe(true);
			expect(eventsOf(me.id)).toEqual([
				new UserRegistered(me.id, me.username!, "en"),
				new UserVerified(me.id),
			]);
		});
	});

	describe("choosing the username", () => {
		async function pendingAccount(locale = "ru") {
			const client = browser(app);
			await signInWith(client, "google", providerUser(), { locale });
			return { client, me: await meOf(client) };
		}

		it("completes the account: announced, given a profile, and able to play", async () => {
			const { client, me } = await pendingAccount();

			const response = await client
				.put("/api/me/username", { username: "Lady_Ada" })
				.expect(200);

			expect(MeResponse.parse(response.body).username).toBe("lady_ada");
			expect(eventsOf(me.id)).toEqual([
				new UserRegistered(me.id, "lady_ada", "ru"),
				new UserVerified(me.id),
			]);
			await vi.waitFor(async () => {
				const [profile] = await database.db
					.select()
					.from(profiles)
					.where(eq(profiles.userId, me.id));
				expect(profile).toMatchObject({ username: "lady_ada", locale: "ru" });
			});
			await client.get("/api/probe/players-only").expect(200);
		});

		it("refuses a taken username inline, and a second choice", async () => {
			const taken = (await signUpAndVerify(browser(app))).username;
			const { client } = await pendingAccount();

			const conflict = await client
				.put("/api/me/username", { username: taken.toUpperCase() })
				.expect(409);
			expect(problemOf(conflict).code).toBe("identity.username-taken");

			await client
				.put("/api/me/username", { username: "first_pick" })
				.expect(200);
			const again = await client
				.put("/api/me/username", { username: "second_pick" })
				.expect(409);
			expect(problemOf(again).code).toBe("identity.username-already-chosen");
			expect((await meOf(client)).username).toBe("first_pick");
		});

		it("holds the username to the sign-up rules and needs a session", async () => {
			const { client } = await pendingAccount();

			const invalid = await client
				.put("/api/me/username", { username: "a.b" })
				.expect(400);
			expect(problemOf(invalid).code).toBe("request.invalid");
			await browser(app)
				.put("/api/me/username", { username: "anyone" })
				.expect(401);
		});
	});

	describe("a returning player", () => {
		it("signs in to the same account and lands on callbackURL", async () => {
			const user = providerUser({ handle: `returning_${lastProviderId}` });
			const first = browser(app);
			await signInWith(first, "github", user);
			const { id } = await meOf(first);

			const second = browser(app);
			const callback = await signInWith(second, "github", user);

			expect(callback.headers.location).toBe(HOME);
			expect((await meOf(second)).id).toBe(id);
		});

		it("is never linked silently to an account with the same email", async () => {
			const client = browser(app);
			const account = await signUpAndVerify(client);
			const { id } = await meOf(client);

			const stranger = browser(app);
			const callback = await signInWith(
				stranger,
				"github",
				providerUser({ email: account.email, handle: "someone_else" }),
			);

			expect(callback.headers.location).toBe(
				`${SIGN_IN}?error=account_not_linked`,
			);
			expect(await linkedProviders(client)).toEqual(["credential"]);
			await stranger.get("/api/me").expect(401);
			const owned = await database.db
				.select({ providerId: accounts.providerId })
				.from(accounts)
				.where(eq(accounts.userId, id));
			expect(owned).toEqual([{ providerId: "credential" }]);
		});
	});

	describe("linking from settings", () => {
		it("adds a provider, with another email, to the signed-in account", async () => {
			const client = browser(app);
			await signUpAndVerify(client);
			const { id } = await meOf(client);
			const atGitHub = providerUser({ handle: "linked_handle" });

			const callback = await signInWith(client, "github", atGitHub, {
				link: true,
			});

			expect(callback.headers.location).toBe(SETTINGS);
			expect(await linkedProviders(client)).toEqual(["credential", "github"]);
			// From now on GitHub signs in to this account, and keeps its username.
			const elsewhere = browser(app);
			expect(
				(await signInWith(elsewhere, "github", atGitHub)).headers.location,
			).toBe(HOME);
			expect(await meOf(elsewhere)).toMatchObject({ id });
		});

		it("refuses a provider account that already belongs to someone else", async () => {
			const atDiscord = providerUser({ handle: `owner_${lastProviderId}` });
			await signInWith(browser(app), "discord", atDiscord);
			const client = browser(app);
			await signUpAndVerify(client);

			const callback = await signInWith(client, "discord", atDiscord, {
				link: true,
			});

			expect(callback.headers.location).toBe(
				`${SETTINGS}?error=account_already_linked_to_different_user`,
			);
			expect(await linkedProviders(client)).toEqual(["credential"]);
		});

		it("needs a session", async () => {
			const refused = await browser(app)
				.post("/api/auth/link-social", {
					provider: "github",
					callbackURL: "/en/settings",
				})
				.expect(401);

			expect(problemOf(refused).code).toBe("auth.unauthorized");
		});
	});

	describe("unlinking", () => {
		const accountIdOf = async (client: Browser, providerId: string) =>
			LinkedAccountsResponse.parse(
				(await client.get("/api/auth/list-accounts").expect(200)).body,
			).find((account) => account.providerId === providerId)!.id;

		it("removes a provider while the password remains", async () => {
			const client = browser(app);
			await signUpAndVerify(client);
			await signInWith(client, "google", providerUser(), { link: true });

			await client
				.post("/api/auth/unlink-account", {
					accountId: await accountIdOf(client, "google"),
				})
				.expect(200);

			expect(await linkedProviders(client)).toEqual(["credential"]);
		});

		it("keeps the last way to sign in", async () => {
			const client = browser(app);
			await signInWith(
				client,
				"github",
				providerUser({ handle: `only_${lastProviderId}` }),
			);

			const refused = await client
				.post("/api/auth/unlink-account", {
					accountId: await accountIdOf(client, "github"),
				})
				.expect(400);

			expect(problemOf(refused).code).toBe(
				"auth.failed-to-unlink-last-account",
			);
			expect(await linkedProviders(client)).toEqual(["github"]);
		});

		it("asks for a recent sign-in", async () => {
			const client = browser(app);
			await signUpAndVerify(client);
			await signInWith(
				client,
				"discord",
				providerUser({ handle: `stale_${lastProviderId}` }),
				{
					link: true,
				},
			);
			const { id } = await meOf(client);
			await database.db
				.update(sessions)
				.set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
				.where(eq(sessions.userId, id));

			const refused = await client
				.post("/api/auth/unlink-account", {
					accountId: await accountIdOf(client, "discord"),
				})
				.expect(403);

			expect(problemOf(refused).code).toBe("auth.session-not-fresh");
		});
	});

	describe("the redirect flow", () => {
		it("leads only back to the web app", async () => {
			const refused = await browser(app)
				.post("/api/auth/sign-in/social", {
					provider: "github",
					callbackURL: "/en",
					errorCallbackURL: "https://evil.example/phish",
				})
				.expect(403);

			expect(problemOf(refused).code).toBe("auth.invalid-callback-url");
		});

		it("sends a callback without its state to the web app's sign-in page", async () => {
			const callback = await browser(app)
				.get("/api/auth/callback/github?code=anything")
				.expect(302);

			// The web app adds the visitor's locale.
			expect(callback.headers.location).toBe(
				`${ANY_SIGN_IN}?error=state_not_found`,
			);
		});

		it("never exchanges a code that comes back with another browser's state", async () => {
			const victim = browser(app);
			const start = await victim
				.post("/api/auth/sign-in/social", {
					provider: "github",
					callbackURL: "/en",
				})
				.expect(200);
			const state = new URL(start.body.url).searchParams.get("state")!;
			const requests = providers.tokenRequests.length;

			const callback = await browser(app)
				.get(
					`/api/auth/callback/github?${new URLSearchParams({
						code: providers.consent(providerUser({ handle: "attacker" })),
						state,
					})}`,
				)
				.expect(302);

			expect(callback.headers.location).toMatch(
				new RegExp(`^${ANY_SIGN_IN}\\?error=state_mismatch`),
			);
			expect(providers.tokenRequests).toHaveLength(requests);
		});

		it("does not take an ID token from the client, only the redirect flow", async () => {
			const response = await browser(app)
				.post("/api/auth/sign-in/social", {
					provider: "google",
					callbackURL: "/en",
					idToken: { token: "forged.id.token" },
				})
				.expect(200);

			expect(new URL(response.body.url).origin).toBe(
				"https://accounts.google.com",
			);
		});
	});

	it("leaves out providers without keys", async () => {
		const bare = await createTestApp({
			config: {
				database: { url: database.url },
				auth: {
					...exampleConfig().auth,
					oauth: { github: FAKE_OAUTH_CLIENTS.github },
				},
			},
		});
		try {
			expect(
				(await browser(bare).get("/api/oauth-providers").expect(200)).body,
			).toEqual({ providers: ["github"] });
			const refused = await browser(bare)
				.post("/api/auth/sign-in/social", {
					provider: "google",
					callbackURL: "/en",
				})
				.expect(404);
			expect(problemOf(refused).code).toBe("auth.provider-not-found");
		} finally {
			await bare.close();
		}
	});
});
