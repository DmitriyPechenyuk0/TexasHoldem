import { ApiError, type HttpClient, NetworkError } from "@/shared/api";
import { fetchViewer } from "./viewer";

const answering = (answer: () => Promise<unknown>) =>
	({ request: vi.fn(answer) }) as unknown as HttpClient & {
		request: ReturnType<typeof vi.fn>;
	};

const problem = (status: number, code: string) =>
	new ApiError({ type: "about:blank", title: "x", status, code });

describe("fetchViewer", () => {
	it("answers the account from GET /api/me", async () => {
		const me = {
			id: "u",
			username: "alice",
			email: "a@b.c",
			emailVerified: true,
			locale: "en",
		};
		const client = answering(async () => me);

		await expect(fetchViewer(client)).resolves.toBe(me);
		expect(client.request).toHaveBeenCalledWith(
			"/me",
			expect.objectContaining({}),
		);
	});

	it("answers null without a session", async () => {
		const client = answering(async () => {
			throw problem(401, "auth.unauthenticated");
		});

		await expect(fetchViewer(client)).resolves.toBeNull();
	});

	it.each([
		["a server error", problem(500, "internal")],
		["an unreachable api", new NetworkError(new URL("http://api.test"))],
	])("passes %s on, rather than reading it as signed out", async (_, error) => {
		await expect(
			fetchViewer(
				answering(async () => {
					throw error;
				}),
			),
		).rejects.toBe(error);
	});
});
