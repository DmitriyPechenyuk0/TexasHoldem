import { endSessionState, onSessionEnd } from "./session-reset";

describe("session state", () => {
	it("runs every registered reset when the session ends, until it is unregistered", () => {
		const first = vi.fn();
		const second = vi.fn();
		onSessionEnd(first);
		const unregister = onSessionEnd(second);

		endSessionState();
		unregister();
		endSessionState();

		expect(first).toHaveBeenCalledTimes(2);
		expect(second).toHaveBeenCalledTimes(1);
	});
});
