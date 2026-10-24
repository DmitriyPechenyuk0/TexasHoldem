import { useServerClock } from "./server-clock";

describe("useServerClock", () => {
	it("has no offset before the first sync", () => {
		expect(useServerClock.getState().offsetMs).toBeNull();
	});

	it("measures how far the server clock runs ahead of the device's", () => {
		const receivedAt = Date.parse("2026-10-24T12:00:00.000Z");

		useServerClock.getState().sync("2026-10-24T12:00:01.500Z", receivedAt);
		expect(useServerClock.getState().offsetMs).toBe(1500);

		useServerClock.getState().sync("2026-10-24T11:59:59.750Z", receivedAt);
		expect(useServerClock.getState().offsetMs).toBe(-250);
	});
});
