import { type Problem, PROBLEM_CONTENT_TYPE } from "@holdem/shared";
import { z } from "zod";
import { ApiError, NetworkError, RequestTimeoutError } from "./errors";
import { createHttpClient } from "./http";

const client = createHttpClient({
	baseUrl: "http://api.test",
	headers: { cookie: "session=abc" },
});
const Item = z.object({ id: z.string() });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});

const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		...init,
	});

const lastRequest = () => {
	const [url, init] = fetchMock.mock.lastCall!;
	return { url: String(url), init: init!, headers: new Headers(init!.headers) };
};

describe("createHttpClient", () => {
	it("sends the cookie, configured headers and query, and parses the answer", async () => {
		fetchMock.mockResolvedValue(json({ id: "t1", extra: true }));

		const item = await client.request("/tables/t1", {
			schema: Item,
			query: { page: 2, open: true, skipped: undefined },
		});

		expect(item).toEqual({ id: "t1" });
		const { url, init, headers } = lastRequest();
		expect(url).toBe("http://api.test/tables/t1?page=2&open=true");
		expect(init.method).toBe("GET");
		expect(init.credentials).toBe("include");
		expect(init.body).toBeUndefined();
		expect(headers.get("cookie")).toBe("session=abc");
		expect(headers.get("accept")).toContain(PROBLEM_CONTENT_TYPE);
		expect(headers.has("content-type")).toBe(false);
	});

	it("sends a body as JSON", async () => {
		fetchMock.mockResolvedValue(json({ id: "t2" }, { status: 201 }));

		await client.request("/tables", {
			method: "POST",
			schema: Item,
			body: { name: "Friday" },
		});

		const { init, headers } = lastRequest();
		expect(init.method).toBe("POST");
		expect(init.body).toBe('{"name":"Friday"}');
		expect(headers.get("content-type")).toBe("application/json");
	});

	it("reads no body from a 204", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

		await expect(
			client.request("/tables/t1", { method: "DELETE", schema: z.undefined() }),
		).resolves.toBeUndefined();
	});

	it("turns a problem+json answer into an ApiError with its code", async () => {
		const problem: Problem = {
			type: "about:blank",
			title: "Conflict",
			status: 409,
			code: "table.seat-taken",
			detail: "Seat 3 is taken",
			params: { seat: 3 },
			requestId: "req-1",
		};
		fetchMock.mockResolvedValue(
			json(problem, {
				status: 409,
				headers: { "content-type": PROBLEM_CONTENT_TYPE },
			}),
		);

		const error = await client
			.request("/tables/t1/seats", { method: "POST", schema: Item })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			status: 409,
			code: "table.seat-taken",
			problem,
			message: "409 table.seat-taken: Seat 3 is taken",
		});
	});

	it.each([
		[
			"a non-problem answer",
			() => new Response("<html>Bad Gateway</html>", { status: 502 }),
		],
		[
			"a malformed problem",
			() =>
				new Response("{", {
					status: 502,
					headers: { "content-type": PROBLEM_CONTENT_TYPE },
				}),
		],
		[
			"a problem that breaks the contract",
			() =>
				json(
					{ status: 502 },
					{ status: 502, headers: { "content-type": PROBLEM_CONTENT_TYPE } },
				),
		],
	])("still gives an ApiError with a code for %s", async (_, response) => {
		fetchMock.mockResolvedValue(response());

		const error = await client
			.request("/system/time", { schema: Item })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 502, code: "http.502" });
	});

	it("throws a NetworkError when the api cannot be reached", async () => {
		const cause = new TypeError("fetch failed");
		fetchMock.mockRejectedValue(cause);

		const error = await client
			.request("/system/time", { schema: Item })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(NetworkError);
		expect(error).toMatchObject({ code: "network.unreachable", cause });
	});

	it("passes a cancellation through untouched", async () => {
		const controller = new AbortController();
		controller.abort();
		const abort = new DOMException("Aborted", "AbortError");
		fetchMock.mockRejectedValue(abort);

		await expect(
			client.request("/system/time", {
				schema: Item,
				signal: controller.signal,
			}),
		).rejects.toBe(abort);
		// The caller's signal is combined with the timeout, so cancelling it cancels the fetch.
		expect(lastRequest().init.signal?.aborted).toBe(true);
	});

	it("gives up on an api that does not answer in time", async () => {
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) =>
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason),
					),
				),
		);
		const impatient = createHttpClient({
			baseUrl: "http://api.test",
			timeoutMs: 20,
		});

		const error = await impatient
			.request("/system/time", { schema: Item })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(RequestTimeoutError);
		expect(error).toMatchObject({ code: "network.timeout" });
	});

	it("rejects a successful answer that is not JSON as outside its contract", async () => {
		fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));

		await expect(
			client.request("/tables/t1", { schema: Item }),
		).rejects.toThrow("GET /tables/t1 answered outside its contract");
	});

	it("rejects an answer that breaks its contract", async () => {
		fetchMock.mockResolvedValue(json({ id: 42 }));

		await expect(
			client.request("/tables/t1", { schema: Item }),
		).rejects.toThrow("GET /tables/t1 answered outside its contract");
	});
});
