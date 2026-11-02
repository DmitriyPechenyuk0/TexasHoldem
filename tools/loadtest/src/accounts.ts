import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv, promisify } from "node:util";
import pg from "pg";
import { API_DIR } from "./instances.ts";

const run = promisify(execFile);

/** The api's settings from `apps/api/.env`, which the instances read too. */
export async function apiEnv(): Promise<Record<string, string | undefined>> {
	const text = await readFile(`${API_DIR}.env`, "utf8").catch(() => "");
	return { ...parseEnv(text), ...process.env };
}

/** A database of the run's own, migrated, dropped at the end. */
export async function createDatabase(serverUrl: string) {
	const name = `holdem_loadtest_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
	const url = new URL(serverUrl);
	url.pathname = `/${name}`;
	const admin = async (statement: string) => {
		const client = new pg.Client({ connectionString: serverUrl });
		await client.connect();
		try {
			await client.query(statement);
		} finally {
			await client.end();
		}
	};
	await admin(`CREATE DATABASE "${name}"`);
	await run("pnpm", ["--filter", "@holdem/api", "db:migrate"], {
		env: { ...process.env, DATABASE_URL: url.toString() },
	});
	return {
		url: url.toString(),
		/** Marks accounts verified, as the emailed link would. */
		async verify(emails: readonly string[]): Promise<void> {
			const client = new pg.Client({ connectionString: url.toString() });
			await client.connect();
			try {
				await client.query(
					"update identity_users set email_verified = true where email = any($1)",
					[emails],
				);
			} finally {
				await client.end();
			}
		},
		drop: () => admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
	};
}

/** A signed-in player: their session cookie, and the address they appear to come from. */
export interface Player {
	readonly userId: string;
	readonly cookie: string;
	readonly address: string;
}

const PASSWORD = "load-test-password-7b1f";

/**
 * Accounts as players make them: signed up through the api, each from an address of its own
 * (`TRUST_PROXY=loopback` reads it from X-Forwarded-For), so per-address limits apply as for
 * real players. Verified straight in the database, then signed in.
 */
export async function createPlayers(
	apiUrl: string,
	origin: string,
	count: number,
	verify: (emails: readonly string[]) => Promise<void>,
): Promise<Player[]> {
	const accounts = Array.from({ length: count }, (_, index) => {
		const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
		return {
			username: `bot_${suffix}`,
			email: `bot.${suffix}@loadtest.test`,
			address: `10.${Math.floor(index / 250) + 1}.${(index % 250) + 1}.7`,
		};
	});
	const post = (path: string, body: object, address: string) =>
		fetch(`${apiUrl}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: origin,
				"X-Forwarded-For": address,
			},
			body: JSON.stringify(body),
		});
	for (const { username, email, address } of accounts) {
		const response = await post(
			"/api/auth/sign-up/email",
			{ username, email, password: PASSWORD, name: username },
			address,
		);
		if (!response.ok) {
			throw new Error(
				`Sign-up refused: ${response.status} ${await response.text()}`,
			);
		}
	}
	await verify(accounts.map(({ email }) => email));
	const players: Player[] = [];
	for (const { email, address } of accounts) {
		const response = await post(
			"/api/auth/sign-in/email",
			{ email, password: PASSWORD },
			address,
		);
		const cookie = response.headers
			.getSetCookie()
			.map((header) => header.split(";")[0]!)
			.find((pair) => pair.includes("session_token="));
		if (!response.ok || !cookie) {
			throw new Error(`Sign-in refused: ${response.status}`);
		}
		const { user } = (await response.json()) as { user: { id: string } };
		players.push({ userId: user.id, cookie, address });
	}
	return players;
}
