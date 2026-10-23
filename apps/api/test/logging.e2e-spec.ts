import {
	Controller,
	Get,
	type INestApplication,
	Injectable,
	Logger,
	Param,
} from "@nestjs/common";
import {
	Command,
	CommandBus,
	CommandHandler,
	type ICommandHandler,
} from "@nestjs/cqrs";
import request from "supertest";
import type { App } from "supertest/types.js";
import { LogContext } from "@/shared/application/log-context.js";
import { DomainError } from "@/shared/domain/domain-error.js";
import { captureLogs, type LogLine } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";

class SeatTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "probe.seat-taken";
}

class TakeSeatCommand extends Command<void> {
	constructor(readonly outcome: "ok" | "rule" | "bug") {
		super();
	}
}

@CommandHandler(TakeSeatCommand)
class TakeSeatHandler implements ICommandHandler<TakeSeatCommand> {
	private readonly logger = new Logger(TakeSeatHandler.name);

	async execute({ outcome }: TakeSeatCommand): Promise<void> {
		this.logger.log("taking a seat");
		if (outcome === "rule") throw new SeatTakenError("Seat 3 is taken");
		if (outcome === "bug") throw new TypeError("boom");
	}
}

@Injectable()
@Controller("probe")
class ProbeController {
	private readonly logger = new Logger(ProbeController.name);

	constructor(private readonly commandBus: CommandBus) {}

	@Get("seat/:outcome")
	async takeSeat(@Param("outcome") outcome: "ok" | "rule" | "bug") {
		this.logger.log("before the command");
		await this.commandBus.execute(new TakeSeatCommand(outcome));
		return { ok: true };
	}

	@Get("secrets")
	logSecrets() {
		this.logger.log({
			event: "sign-in",
			password: "hunter2-password",
			user: { name: "ann", token: "user-token-value" },
			session: { auth: { secret: "deep-secret-value" } },
		});
		return { ok: true };
	}
}

describe("Logging (e2e)", () => {
	const { lines } = captureLogs();
	let app: INestApplication<App>;

	beforeAll(async () => {
		app = await createTestApp({
			controllers: [ProbeController],
			providers: [TakeSeatHandler],
		});
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		lines.length = 0;
	});

	const linesFor = (requestId: string): LogLine[] =>
		lines.filter((line) => line.requestId === requestId);

	it("puts the request id on every line written while handling the request", async () => {
		const response = await request(app.getHttpServer())
			.get("/probe/seat/ok")
			.expect(200);
		const requestId = response.headers["x-request-id"] as string;

		expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(lines.length).toBeGreaterThanOrEqual(4);
		expect(linesFor(requestId)).toEqual(lines);
		expect(lines.map((line) => line.msg)).toEqual([
			"before the command",
			"taking a seat",
			"command handled",
			"request completed",
		]);
	});

	it("keeps a request id sent by a proxy", async () => {
		await request(app.getHttpServer())
			.get("/probe/seat/ok")
			.set("x-request-id", "edge-7f3a")
			.expect("x-request-id", "edge-7f3a");

		expect(linesFor("edge-7f3a")).toHaveLength(lines.length);
	});

	it("logs every command with its name, duration and outcome at debug level", async () => {
		await request(app.getHttpServer()).get("/probe/seat/ok").expect(200);
		await request(app.getHttpServer()).get("/probe/seat/rule").expect(409);
		await request(app.getHttpServer()).get("/probe/seat/bug").expect(500);

		const commands = lines.filter((line) => line.msg === "command handled");
		expect(commands).toEqual([
			expect.objectContaining({
				level: "debug",
				context: "CommandBus",
				command: "TakeSeatCommand",
				outcome: "succeeded",
				durationMs: expect.any(Number),
			}),
			expect.objectContaining({
				command: "TakeSeatCommand",
				outcome: "rejected",
				code: "probe.seat-taken",
			}),
			expect.objectContaining({
				command: "TakeSeatCommand",
				outcome: "failed",
				error: "TypeError",
			}),
		]);
	});

	it("never writes passwords, tokens, cookies or authorization headers", async () => {
		await request(app.getHttpServer())
			.get("/probe/secrets?token=query-token-value&next=/lobby")
			.set("authorization", "Bearer bearer-token-value")
			.set("cookie", "session=session-cookie-value")
			.expect(200);

		const written = JSON.stringify(lines);
		for (const secret of [
			"hunter2-password",
			"user-token-value",
			"deep-secret-value",
			"query-token-value",
			"bearer-token-value",
			"session-cookie-value",
		]) {
			expect(written).not.toContain(secret);
		}
		expect(lines).toContainEqual(
			expect.objectContaining({
				event: "sign-in",
				password: "[redacted]",
				user: { name: "ann", token: "[redacted]" },
				session: { auth: { secret: "[redacted]" } },
			}),
		);
		expect(lines).toContainEqual(
			expect.objectContaining({
				msg: "request completed",
				req: expect.objectContaining({ method: "GET", path: "/probe/secrets" }),
			}),
		);
	});

	it("does not log health checks", async () => {
		await request(app.getHttpServer()).get("/health").expect(200);

		expect(lines).toEqual([]);
	});

	it("binds socket-style context to every line inside LogContext.run, across awaits", async () => {
		const logger = new Logger("TableGateway");

		await app
			.get(LogContext)
			.run({ connectionId: "conn-1", tableId: "table-9" }, async () => {
				logger.log({ msg: "seat requested", seat: 3 });
				await new Promise((resolve) => setTimeout(resolve, 5));
				logger.log("seat granted");
			});
		logger.log("outside");

		expect(lines).toEqual([
			expect.objectContaining({
				msg: "seat requested",
				seat: 3,
				connectionId: "conn-1",
				tableId: "table-9",
			}),
			expect.objectContaining({
				msg: "seat granted",
				connectionId: "conn-1",
				tableId: "table-9",
			}),
			expect.not.objectContaining({ connectionId: "conn-1" }),
		]);
	});
});
