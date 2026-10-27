import { Logger } from "@nestjs/common";
import type { NodemailerError, SendMailOptions } from "nodemailer";
import type { Email } from "../../application/mailer.js";
import type { AppConfig } from "../config/index.js";
import {
	type MailTransport,
	RETRY_DELAYS_MS,
	SmtpMailer,
} from "./smtp-mailer.js";

const config = {
	smtp: { from: "Texas Hold'em <no-reply@holdem.local>" },
} as AppConfig;

const email: Email = {
	to: "alice@example.test",
	locale: "ru",
	template: "verify-email",
	params: {
		username: "alice",
		url: "https://holdem.example/verify?token=abc",
		expiresInMinutes: 24 * 60,
	},
};

const smtpError = (fields: Partial<NodemailerError>): NodemailerError =>
	Object.assign(new Error(fields.message ?? "SMTP failed"), fields);

const connectionLost = () =>
	smtpError({ message: "Connection closed", code: "ECONNECTION" });

/** Answers each `sendMail` with the next outcome: an error to throw, or success once they run out. */
function fakeTransport(...outcomes: Error[]) {
	return {
		sendMail: vi.fn(async (_message: SendMailOptions) => {
			const outcome = outcomes.shift();
			if (outcome) {
				throw outcome;
			}
			return { messageId: "<1@holdem.local>" };
		}),
		close: vi.fn(),
	} satisfies MailTransport;
}

function spyOnLogs() {
	const silent = () => undefined;
	return {
		debug: vi.spyOn(Logger.prototype, "debug").mockImplementation(silent),
		warn: vi.spyOn(Logger.prototype, "warn").mockImplementation(silent),
		error: vi.spyOn(Logger.prototype, "error").mockImplementation(silent),
	};
}

describe("SmtpMailer", () => {
	let logs: ReturnType<typeof spyOnLogs>;

	beforeEach(() => {
		vi.useFakeTimers();
		logs = spyOnLogs();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("sends the rendered email from SMTP_FROM without making the caller wait", async () => {
		const transport = fakeTransport();
		const mailer = new SmtpMailer(config, transport);

		expect(mailer.send(email)).toBeUndefined();

		expect(transport.sendMail).toHaveBeenCalledExactlyOnceWith({
			from: "Texas Hold'em <no-reply@holdem.local>",
			to: "alice@example.test",
			subject: "Подтвердите почту для Техасского холдема",
			html: expect.stringContaining('<html lang="ru">'),
			text: expect.stringContaining("https://holdem.example/verify?token=abc"),
			headers: { "Auto-Submitted": "auto-generated" },
		});
		await vi.runAllTimersAsync();
		expect(logs.debug).toHaveBeenCalledExactlyOnceWith({
			msg: "email sent",
			template: "verify-email",
			attempt: 1,
			messageId: "<1@holdem.local>",
		});
	});

	it("retries transient failures until the email is delivered", async () => {
		const transport = fakeTransport(
			connectionLost(),
			smtpError({ responseCode: 421, permanent: false }),
		);
		const mailer = new SmtpMailer(config, transport);

		mailer.send(email);
		await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]! - 1);
		expect(transport.sendMail).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(transport.sendMail).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]!);
		expect(transport.sendMail).toHaveBeenCalledTimes(3);

		expect(logs.warn.mock.calls).toEqual([
			[
				expect.objectContaining({
					msg: "email delivery failed, retrying",
					attempt: 1,
					retryInMs: RETRY_DELAYS_MS[0],
					code: "ECONNECTION",
				}),
			],
			[
				expect.objectContaining({
					attempt: 2,
					retryInMs: RETRY_DELAYS_MS[1],
					responseCode: 421,
				}),
			],
		]);
		expect(logs.debug).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "email sent", attempt: 3 }),
		);
		expect(logs.error).not.toHaveBeenCalled();
	});

	it("gives up after the last retry and logs the failure without the recipient", async () => {
		const attempts = RETRY_DELAYS_MS.length + 1;
		const transport = fakeTransport(
			...Array.from({ length: attempts }, connectionLost),
		);
		const mailer = new SmtpMailer(config, transport);

		mailer.send(email);
		await vi.runAllTimersAsync();

		expect(transport.sendMail).toHaveBeenCalledTimes(attempts);
		expect(logs.error).toHaveBeenCalledExactlyOnceWith({
			msg: "email not delivered",
			template: "verify-email",
			attempts,
			reason: "Connection closed",
			code: "ECONNECTION",
			responseCode: undefined,
		});
		const logged = JSON.stringify([
			logs.warn.mock.calls,
			logs.error.mock.calls,
		]);
		expect(logged).not.toContain("alice@example.test");
	});

	it.each([
		[
			"a permanent rejection",
			smtpError({ responseCode: 550, permanent: true }),
		],
		["an invalid address", smtpError({ code: "EENVELOPE" })],
	])("does not retry %s", async (_, error) => {
		const transport = fakeTransport(error);
		const mailer = new SmtpMailer(config, transport);

		mailer.send(email);
		await vi.runAllTimersAsync();

		expect(transport.sendMail).toHaveBeenCalledTimes(1);
		expect(logs.warn).not.toHaveBeenCalled();
		expect(logs.error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: "email not delivered", attempts: 1 }),
		);
	});

	it("throws a template error to the caller instead of sending", () => {
		const transport = fakeTransport();
		const mailer = new SmtpMailer(config, transport);

		expect(() =>
			mailer.send({
				...email,
				params: { ...email.params, url: "javascript:alert(1)" },
			}),
		).toThrow("Email links must be absolute http(s) URLs");
		expect(transport.sendMail).not.toHaveBeenCalled();
	});

	describe("on shutdown", () => {
		it("waits for an attempt in flight, then closes the transport", async () => {
			let resolve!: (info: { messageId: string }) => void;
			const sent = new Promise<{ messageId: string }>((done) => {
				resolve = done;
			});
			const transport = fakeTransport();
			transport.sendMail.mockReturnValueOnce(sent);
			const mailer = new SmtpMailer(config, transport);

			mailer.send(email);
			let closed = false;
			const shutdown = mailer.onApplicationShutdown().then(() => {
				closed = true;
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(closed).toBe(false);
			expect(transport.close).not.toHaveBeenCalled();

			resolve({ messageId: "<1@holdem.local>" });
			await shutdown;
			expect(transport.close).toHaveBeenCalledOnce();
			expect(logs.debug).toHaveBeenCalledWith(
				expect.objectContaining({ msg: "email sent" }),
			);
		});

		it("drops a pending retry instead of waiting for it", async () => {
			const transport = fakeTransport(connectionLost());
			const mailer = new SmtpMailer(config, transport);

			mailer.send(email);
			await vi.advanceTimersByTimeAsync(0);
			await mailer.onApplicationShutdown();

			expect(transport.sendMail).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
			expect(logs.error).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					msg: "email not delivered: the api shut down before the next attempt",
					attempts: 1,
				}),
			);
		});

		it("drops emails sent afterwards", async () => {
			const transport = fakeTransport();
			const mailer = new SmtpMailer(config, transport);
			await mailer.onApplicationShutdown();

			mailer.send(email);

			expect(transport.sendMail).not.toHaveBeenCalled();
			expect(logs.error).toHaveBeenCalledExactlyOnceWith({
				msg: "email dropped: the api is shutting down",
				template: "verify-email",
			});
		});
	});
});
