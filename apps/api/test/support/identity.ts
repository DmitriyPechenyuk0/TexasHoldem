import { randomUUID } from "node:crypto";
import { Problem, PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { exampleConfig } from "./example-config.js";
import { waitForLink } from "./mailpit.js";

// Helpers for e2e tests of the identity endpoints: accounts, browsers, cookies and emailed links.

export const WEB_ORIGIN = exampleConfig().webOrigin;
export const PASSWORD = "correct horse battery";

export const problemOf = (response: request.Response): Problem => {
	expect(response.headers["content-type"]).toMatch(
		new RegExp(`^${PROBLEM_CONTENT_TYPE.replace("+", "\\+")}`),
	);
	return Problem.parse(response.body);
};

/** A new account's details, unique per call: every test shares one database and Mailpit. */
export const newAccount = () => {
	const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
	return {
		username: `User_${suffix}`,
		email: `user.${suffix}@example.test`,
		password: PASSWORD,
	};
};
export type Account = ReturnType<typeof newAccount>;

let lastAddress = 0;

/**
 * One browser: its own cookies and, through TRUST_PROXY, its own client address, so the rate
 * limits of one test never spill into another. The app needs `trustProxy: "loopback"`.
 */
export function browser(app: INestApplication<App>) {
	const agent = request.agent(app.getHttpServer());
	const ip = `203.0.113.${++lastAddress}`;
	const authed = <T extends request.Test>(test: T): T =>
		test.set("X-Forwarded-For", ip).set("Origin", WEB_ORIGIN) as T;
	return {
		ip,
		get: (path: string) => authed(agent.get(path)),
		post: (path: string, body?: object) =>
			authed(agent.post(path)).send(body ?? {}),
	};
}
export type Browser = ReturnType<typeof browser>;

/** A URL as a path on the api, for supertest. */
export const pathOf = (url: URL): string => `${url.pathname}${url.search}`;

export const sessionCookieOf = (
	response: request.Response,
): string | undefined =>
	([] as string[])
		.concat(response.headers["set-cookie"] ?? [])
		.find((cookie) => /^(__Secure-)?holdem\.session_token=[^;]+/.test(cookie));

/** The verification link from the email Mailpit caught. */
export const verificationLinkFor = (email: string): Promise<URL> =>
	waitForLink(email, /https?:\/\/\S+\/api\/auth\/verify-email\?\S+/);

/** Signs up and opens the link from the email, which signs the browser in. */
export async function signUpAndVerify(
	client: Browser,
	account = newAccount(),
): Promise<Account> {
	await client.post("/api/auth/sign-up/email", account).expect(200);
	const link = await verificationLinkFor(account.email);
	await client.get(pathOf(link)).expect(302);
	return account;
}
