import type { INestApplication } from "@nestjs/common";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import type { App } from "supertest/types.js";
import { browser, PASSWORD, signUpAndVerify, WEB_ORIGIN } from "./identity.js";

let lastAddress = 0;

/** Signs a new verified user in; answers the session cookie for a Cookie header, the user id and email. */
export async function signedInUser(
	app: INestApplication<App>,
): Promise<{ cookie: string; userId: string; email: string }> {
	const { email } = await signUpAndVerify(browser(app));
	return { ...(await signIn(app, email)), email };
}

/** Signs the user in once more, as another device would: a session of its own. */
export async function signIn(
	app: INestApplication<App>,
	email: string,
): Promise<{ cookie: string; userId: string }> {
	const response = await request(app.getHttpServer())
		.post("/api/auth/sign-in/email")
		.set("Origin", WEB_ORIGIN)
		.set("X-Forwarded-For", `198.51.100.${++lastAddress}`)
		.send({ email, password: PASSWORD })
		.expect(200);
	const cookie = ([] as string[])
		.concat(response.headers["set-cookie"] ?? [])
		.map((header) => header.split(";")[0]!)
		.find((pair) => pair.startsWith("holdem.session_token="))!;
	return {
		cookie,
		userId: (response.body as { user: { id: string } }).user.id,
	};
}

/** Opens a socket as the browser would, with the cookie; resolves once connected. */
export async function connectedSocket<S extends Socket>(
	baseUrl: string,
	path: string,
	cookie: string,
): Promise<S> {
	const socket = io(`${baseUrl}${path}`, {
		transports: ["websocket"],
		extraHeaders: { origin: WEB_ORIGIN, cookie },
		forceNew: true,
		reconnection: false,
	}) as S;
	await new Promise<void>((resolve, reject) => {
		socket.once("connect", resolve);
		socket.once("connect_error", reject);
	});
	return socket;
}
