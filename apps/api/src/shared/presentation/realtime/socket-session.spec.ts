import { UserId } from "@holdem/shared";
import { Logger } from "@nestjs/common";
import { type Viewer, ViewerResolver } from "../../application/viewer.js";
import { problemFor } from "../problem.js";
import {
	authenticateSockets,
	SocketSessionGuard,
	type ViewerSocket,
} from "./socket-session.js";

const alice: Viewer = {
	userId: UserId.parse("0b7c6f1e-58a4-4f6b-9a39-5f0f6a8a1c2d"),
	username: "alice",
	emailVerified: true,
};

/** Answers with `sessions` in turn: a viewer, null, or an Error to throw. */
class ScriptedResolver extends ViewerResolver {
	readonly calls: unknown[] = [];

	constructor(private readonly sessions: (Viewer | null | Error)[]) {
		super();
	}

	async resolve(headers: unknown): Promise<Viewer | null> {
		this.calls.push(headers);
		const next = this.sessions.shift() ?? null;
		if (next instanceof Error) {
			throw next;
		}
		return next;
	}
}

function fakeSocket(namespace: string) {
	const listeners = new Map<string, () => void>();
	const socket = {
		nsp: { name: namespace },
		request: {
			headers: { cookie: "holdem.session_token=t", "user-agent": "x" },
		},
		data: {} as ViewerSocket["data"],
		emit: vi.fn(),
		disconnect: vi.fn(),
		on: (event: string, listener: () => void) => listeners.set(event, listener),
	};
	return {
		socket,
		asSocket: socket as unknown as ViewerSocket,
		fire: (event: string) => listeners.get(event)?.(),
	};
}

/** Runs the middleware and resolves with what it passed to `next`. */
function join(
	middleware: ReturnType<typeof authenticateSockets>,
	socket: ViewerSocket,
): Promise<(Error & { data?: unknown }) | undefined> {
	return new Promise((resolve) => middleware(socket, resolve));
}

describe("authenticateSockets", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("keeps the viewer and passes only the cookie to the resolver", async () => {
		const resolver = new ScriptedResolver([alice]);
		const { socket, asSocket } = fakeSocket("/table");

		expect(await join(authenticateSockets(resolver), asSocket)).toBeUndefined();
		expect(socket.data.viewer).toEqual(alice);
		expect(resolver.calls).toEqual([{ cookie: "holdem.session_token=t" }]);
	});

	it("lets an anonymous client into a public namespace only", async () => {
		const middleware = authenticateSockets(new ScriptedResolver([null, null]));
		const root = fakeSocket("/");

		expect(await join(middleware, root.asSocket)).toBeUndefined();
		expect(root.socket.data.viewer).toBeNull();
		const refused = await join(middleware, fakeSocket("/lobby").asSocket);
		expect(refused?.message).toBe("auth.unauthenticated");
		expect(refused?.data).toMatchObject({ status: 401 });
	});

	it("refuses the connection with a 500 problem when the session cannot be read", async () => {
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
		const middleware = authenticateSockets(
			new ScriptedResolver([new Error("connection refused")]),
		);

		const refused = await join(middleware, fakeSocket("/").asSocket);

		expect(refused?.data).toEqual(
			problemFor(new Error("connection refused")).problem,
		);
	});

	it("checks an idle socket's session every interval and disconnects it once the session is gone", async () => {
		vi.useFakeTimers();
		const resolver = new ScriptedResolver([
			alice,
			{ ...alice, emailVerified: false },
			new Error("timeout"),
			null,
		]);
		const { socket, asSocket } = fakeSocket("/table");
		await join(authenticateSockets(resolver, 1_000), asSocket);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(socket.data.viewer?.emailVerified).toBe(false);
		// A failed lookup keeps the socket.
		await vi.advanceTimersByTimeAsync(1_000);
		expect(socket.disconnect).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1_000);

		expect(socket.emit).toHaveBeenCalledWith("session-expired", {});
		expect(socket.disconnect).toHaveBeenCalledWith(true);
	});

	it("stops checking once the socket is gone", async () => {
		vi.useFakeTimers();
		const resolver = new ScriptedResolver([alice]);
		const { asSocket, fire } = fakeSocket("/table");
		await join(authenticateSockets(resolver, 1_000), asSocket);

		fire("disconnect");
		await vi.advanceTimersByTimeAsync(5_000);

		expect(resolver.calls).toHaveLength(1);
	});
});

describe("SocketSessionGuard", () => {
	const contextFor = (socket: ViewerSocket) =>
		({ switchToWs: () => ({ getClient: () => socket }) }) as never;

	it("lets an anonymous socket's command through without a lookup", async () => {
		const resolver = new ScriptedResolver([]);
		const { socket, asSocket } = fakeSocket("/");
		socket.data.viewer = null;

		await expect(
			new SocketSessionGuard(resolver).canActivate(contextFor(asSocket)),
		).resolves.toBe(true);
		expect(resolver.calls).toHaveLength(0);
	});

	it("refuses a command when the session now belongs to someone else", async () => {
		const { socket, asSocket } = fakeSocket("/table");
		socket.data.viewer = alice;
		const someoneElse = {
			...alice,
			userId: UserId.parse("5d0b2a8e-6f43-4c2e-9f1d-2b7e8c4a9d10"),
		};

		const refusal = await new SocketSessionGuard(
			new ScriptedResolver([someoneElse]),
		)
			.canActivate(contextFor(asSocket))
			.catch((error: unknown) => problemFor(error).problem);

		expect(refusal).toMatchObject({
			status: 401,
			code: "auth.session-expired",
		});
		expect(socket.disconnect).toHaveBeenCalledWith(true);
	});
});
