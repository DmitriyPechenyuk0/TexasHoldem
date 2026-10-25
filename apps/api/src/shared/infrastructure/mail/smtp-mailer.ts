import {
	Inject,
	Injectable,
	Logger,
	type OnApplicationShutdown,
} from "@nestjs/common";
import type { NodemailerError, SendMailOptions } from "nodemailer";
import {
	type Email,
	type EmailTemplate,
	Mailer,
} from "../../application/mailer.js";
import { AppConfig } from "../config/index.js";
import { renderEmail } from "./templates/render-email.js";

/** Pauses between delivery attempts: four attempts over about half a minute. */
export const RETRY_DELAYS_MS: readonly number[] = [1_000, 5_000, 25_000];

/** The part of a nodemailer transporter the mailer uses; tests replace it. */
export interface MailTransport {
	sendMail(message: SendMailOptions): Promise<{ readonly messageId: string }>;
	close(): void;
}

export const MAIL_TRANSPORT = Symbol("MailTransport");

/** A rejection that would come back on every attempt: a 5xx reply or an invalid address. */
const isPermanent = (error: NodemailerError): boolean =>
	error.permanent === true || error.code === "EENVELOPE";

/** Resolves after `ms`, or to false as soon as `signal` aborts. */
const pause = (ms: number, signal: AbortSignal): Promise<boolean> =>
	new Promise((resolve) => {
		const onAbort = () => {
			clearTimeout(timer);
			resolve(false);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve(true);
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});

/**
 * Delivers email over SMTP in the background, retrying transient failures in process. Lines are
 * logged in the context of the request that sent the email, without the recipient's address.
 */
@Injectable()
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
	private readonly logger = new Logger("Mailer");
	private readonly deliveries = new Set<Promise<void>>();
	private readonly shuttingDown = new AbortController();

	constructor(
		private readonly config: AppConfig,
		@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
	) {
		super();
	}

	send(email: Email): void {
		// Rendered right away, so a broken template fails the caller instead of a background task.
		const { subject, html, text } = renderEmail(email, email.locale);
		if (this.shuttingDown.signal.aborted) {
			this.logger.error({
				msg: "email dropped: the api is shutting down",
				template: email.template,
			});
			return;
		}

		const delivery = this.deliver(email.template, {
			from: this.config.smtp.from,
			to: email.to,
			subject,
			html,
			text,
			headers: { "Auto-Submitted": "auto-generated" },
		}).finally(() => this.deliveries.delete(delivery));
		this.deliveries.add(delivery);
	}

	private async deliver(
		template: EmailTemplate,
		message: SendMailOptions,
	): Promise<void> {
		for (let attempt = 1; ; attempt++) {
			try {
				const { messageId } = await this.transport.sendMail(message);
				this.logger.debug({ msg: "email sent", template, attempt, messageId });
				return;
			} catch (caught) {
				const error = caught as NodemailerError;
				const failure = {
					template,
					reason: error.message,
					code: error.code,
					responseCode: error.responseCode,
				};
				const retryInMs = RETRY_DELAYS_MS[attempt - 1];
				if (retryInMs === undefined || isPermanent(error)) {
					this.logger.error({
						msg: "email not delivered",
						attempts: attempt,
						...failure,
					});
					return;
				}

				this.logger.warn({
					msg: "email delivery failed, retrying",
					attempt,
					retryInMs,
					...failure,
				});
				if (!(await pause(retryInMs, this.shuttingDown.signal))) {
					this.logger.error({
						msg: "email not delivered: the api shut down before the next attempt",
						attempts: attempt,
						...failure,
					});
					return;
				}
			}
		}
	}

	/** Lets attempts in flight finish and drops pending retries, which would outlast the shutdown. */
	async onApplicationShutdown(): Promise<void> {
		this.shuttingDown.abort();
		await Promise.all(this.deliveries);
		this.transport.close();
	}
}
