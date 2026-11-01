import { Logger } from "@nestjs/common";
import type { CommandBus } from "@nestjs/cqrs";
import { ConcurrencyError } from "@/shared/application/event-store.js";
import type { AppConfig } from "@/shared/infrastructure/config/index.js";
import { StartNextHandCommand } from "../application/commands/start-next-hand/start-next-hand.command.js";
import { TimerHandScheduler } from "./timer-hand-scheduler.js";

function setUp(
	execute: (command: unknown) => Promise<unknown> = async () => null,
) {
	const sent: unknown[] = [];
	const commandBus = {
		execute: async (command: unknown) => {
			sent.push(command);
			return execute(command);
		},
	} as unknown as CommandBus;
	const config = { table: { handPauseMs: 3_000 } } as AppConfig;
	return { sent, scheduler: new TimerHandScheduler(commandBus, config) };
}

describe("TimerHandScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("deals the table's next hand after the pause, once however often it is asked", async () => {
		const { sent, scheduler } = setUp();

		scheduler.schedule("t-1");
		await vi.advanceTimersByTimeAsync(2_000);
		scheduler.schedule("t-1");
		scheduler.schedule("t-2");
		expect(sent).toEqual([]);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(sent).toEqual([new StartNextHandCommand("t-1")]);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(sent).toEqual([
			new StartNextHandCommand("t-1"),
			new StartNextHandCommand("t-2"),
		]);

		scheduler.schedule("t-1");
		await vi.advanceTimersByTimeAsync(3_000);
		expect(sent).toHaveLength(3);
	});

	it("tries again after the pause when the deal lost a race, and logs any other failure", async () => {
		const error = vi
			.spyOn(Logger.prototype, "error")
			.mockImplementation(() => {});
		let calls = 0;
		const { sent, scheduler } = setUp(async () => {
			calls += 1;
			if (calls === 1) throw new ConcurrencyError("table-t-1", 3);
			throw new Error("boom");
		});

		scheduler.schedule("t-1");
		await vi.advanceTimersByTimeAsync(3_000);
		expect(sent).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(sent).toHaveLength(2);
		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "next hand not dealt", tableId: "t-1" }),
		);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(sent).toHaveLength(2);
	});

	it("drops pending deals on shutdown", async () => {
		const { sent, scheduler } = setUp();
		scheduler.schedule("t-1");

		scheduler.onApplicationShutdown();
		await vi.advanceTimersByTimeAsync(3_000);

		expect(sent).toEqual([]);
	});
});
