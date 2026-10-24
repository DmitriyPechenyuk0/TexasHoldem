import { environmentManager } from "@tanstack/react-query";
import { ApiError, NetworkError } from "./errors";
import { getQueryClient } from "./query-client";

const conflict = new ApiError({
	type: "about:blank",
	title: "Conflict",
	status: 409,
	code: "table.seat-taken",
});
const unavailable = new ApiError({
	type: "about:blank",
	title: "Service Unavailable",
	status: 503,
	code: "http.503",
});
const offline = new NetworkError(new URL("http://api.test"));

function retryOf(client = getQueryClient()) {
	const retry = client.getDefaultOptions().queries?.retry;
	if (typeof retry !== "function") {
		throw new Error("expected a retry function");
	}
	return (failureCount: number, error: Error) => retry(failureCount, error);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getQueryClient", () => {
	it("gives every server render its own client and never retries there", () => {
		vi.spyOn(environmentManager, "isServer").mockReturnValue(true);

		expect(getQueryClient()).not.toBe(getQueryClient());
		expect(retryOf()(0, offline)).toBe(false);
	});

	it("keeps one client in the browser, retrying only what may change", () => {
		vi.spyOn(environmentManager, "isServer").mockReturnValue(false);
		const client = getQueryClient();
		const retry = retryOf(client);

		expect(getQueryClient()).toBe(client);
		expect(retry(0, conflict)).toBe(false);
		expect(retry(0, unavailable)).toBe(true);
		expect(retry(1, offline)).toBe(true);
		expect(retry(2, offline)).toBe(false);
	});
});
