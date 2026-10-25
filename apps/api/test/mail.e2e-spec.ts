import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { App } from "supertest/types.js";
import {
	type Email,
	type EmailTemplate,
	Mailer,
} from "@/shared/application/mailer.js";
import { captureLogs, type LogLine } from "./support/capture-logs.js";
import { createTestApp } from "./support/create-test-app.js";
import { exampleConfig } from "./support/example-config.js";
import { waitForEmail } from "./support/mailpit.js";
import { TcpProxy } from "./support/tcp-proxy.js";

const link = (token: string) =>
	`http://localhost:4000/api/auth/verify-email?token=${token}&callbackURL=%2F`;

/** An email to an address no other test uses, since every test shares Mailpit's inbox. */
function emailTo(template: EmailTemplate, locale: string) {
	const url = link(randomUUID());
	const email: Email = {
		template,
		locale,
		to: `${template}.${randomUUID()}@example.test`,
		params: { username: "alice", url, expiresInMinutes: 60 },
	};
	return { email, url };
}

async function waitForLog(
	lines: readonly LogLine[],
	matches: (line: LogLine) => boolean,
): Promise<LogLine> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		const line = lines.find(matches);
		if (line || Date.now() > deadline) {
			expect(line).toBeDefined();
			return line!;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

describe("Mail (e2e)", () => {
	describe("with Mailpit up", () => {
		let app: INestApplication<App>;

		beforeAll(async () => {
			app = await createTestApp();
		});

		afterAll(async () => {
			await app.close();
		});

		it.each([
			["verify-email", "en", "Confirm your email for Texas Hold'em"],
			["verify-email", "ru", "Подтвердите почту для Техасского холдема"],
			["reset-password", "en", "Reset your Texas Hold'em password"],
			["reset-password", "ru", "Сброс пароля в Техасском холдеме"],
		] as const)("delivers %s in %s", async (template, locale, subject) => {
			const { email, url } = emailTo(template, locale);

			app.get(Mailer).send(email);
			const message = await waitForEmail(email.to);

			expect(message.Subject).toBe(subject);
			expect(message.From).toEqual({
				Name: "Texas Hold'em",
				Address: "no-reply@holdem.local",
			});
			expect(message.To).toEqual([{ Name: "", Address: email.to }]);
			expect(message.HTML).toContain(`<html lang="${locale}">`);
			expect(message.HTML).toContain(`href="${url.replace("&", "&amp;")}"`);
			expect(message.Text).toContain(url);
			expect(message.headers["Auto-Submitted"]).toEqual(["auto-generated"]);
		});

		it("sends English to a recipient whose locale has no templates", async () => {
			const { email } = emailTo("verify-email", "de-DE");

			app.get(Mailer).send(email);

			expect((await waitForEmail(email.to)).Subject).toBe(
				"Confirm your email for Texas Hold'em",
			);
		});
	});

	it("finishes a delivery in flight before the app shuts down", async () => {
		const app = await createTestApp();
		const { email } = emailTo("reset-password", "ru");

		app.get(Mailer).send(email);
		await app.close();

		// Already in the inbox, without polling: close() waited for the delivery.
		expect((await waitForEmail(email.to, 0)).Subject).toBe(
			"Сброс пароля в Техасском холдеме",
		);
	});

	describe("while the SMTP server is unreachable", () => {
		const smtp = exampleConfig().smtp;
		const proxy = new TcpProxy({ host: smtp.host, port: smtp.port });
		let app: INestApplication<App>;

		beforeAll(async () => {
			// Started once to learn its port, then stopped: connections to it are refused.
			await proxy.start();
			await proxy.stop();
			app = await createTestApp({
				config: { smtp: { ...smtp, port: proxy.localPort } },
			});
		});

		afterAll(async () => {
			await app.close();
			await proxy.stop();
		});

		it("retries and delivers once it is back", async () => {
			const { lines } = captureLogs();
			const { email } = emailTo("verify-email", "en");

			app.get(Mailer).send(email);
			const retry = await waitForLog(
				lines,
				(line) => line.msg === "email delivery failed, retrying",
			);
			expect(retry).toMatchObject({
				context: "Mailer",
				level: "warn",
				template: "verify-email",
				attempt: 1,
			});
			expect(JSON.stringify(retry)).not.toContain(email.to);

			await proxy.start();
			await waitForEmail(email.to);
			await waitForLog(
				lines,
				(line) => line.msg === "email sent" && line.attempt === 2,
			);
		});
	});
});
