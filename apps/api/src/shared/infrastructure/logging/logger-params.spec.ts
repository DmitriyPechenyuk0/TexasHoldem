import { exampleConfig } from "../../../../test/support/example-config.js";
import type { AppConfig } from "../config/index.js";
import { logDestinationFor, loggedPath } from "./logger-params.js";

const withLog = (log: AppConfig["log"]): AppConfig =>
	Object.assign(exampleConfig(), { log });

describe("logDestinationFor", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prints readable lines in development, without touching process exit", () => {
		const once = vi.spyOn(process, "once");
		const destination = logDestinationFor(
			withLog({ level: "debug", pretty: true }),
		);

		expect(typeof destination.write).toBe("function");
		expect(once).not.toHaveBeenCalled();
	});

	it("buffers JSON lines to stdout and writes what is left when the process exits", () => {
		const once = vi.spyOn(process, "once").mockReturnValue(process);
		// A buffered pino destination (SonicBoom), which can flush synchronously.
		const destination = logDestinationFor(
			withLog({ level: "info", pretty: false }),
		) as unknown as { flushSync(): void };
		const flushSync = vi
			.spyOn(destination, "flushSync")
			.mockImplementation(() => undefined);

		expect(once).toHaveBeenCalledWith("exit", expect.any(Function));
		const onExit = once.mock.calls[0]![1] as () => void;
		onExit();
		expect(flushSync).toHaveBeenCalledOnce();
	});
});

describe("loggedPath", () => {
	it.each([
		["/api/system/time?probe=1", "/api/system/time"],
		[
			"/api/auth/verify-email?token=jwt&callbackURL=%2F",
			"/api/auth/verify-email",
		],
		[
			"/api/auth/reset-password/s3cr3t-token?callbackURL=%2Fen",
			"/api/auth/reset-password/[redacted]",
		],
		["/api/auth/reset-password", "/api/auth/reset-password"],
	])("logs %s as %s", (url, path) => {
		expect(loggedPath(url)).toBe(path);
	});
});
