import { Global, Module } from "@nestjs/common";
import { createTransport } from "nodemailer";
import { Mailer } from "../../application/mailer.js";
import { AppConfig } from "../config/index.js";
import {
	MAIL_TRANSPORT,
	type MailTransport,
	SmtpMailer,
} from "./smtp-mailer.js";

/**
 * nodemailer's defaults wait minutes for a dead server (a 2 min connection timeout, 10 min of
 * socket inactivity); a failed attempt should leave time for the retries instead.
 */
const createSmtpTransport = ({ nodeEnv, smtp }: AppConfig): MailTransport =>
	createTransport({
		host: smtp.host,
		port: smtp.port,
		secure: smtp.secure,
		auth: smtp.auth && { user: smtp.auth.user, pass: smtp.auth.password },
		// Emails carry sign-in and reset links: production never sends them in plain text, even
		// when a man in the middle strips STARTTLS from the server's greeting.
		requireTLS: nodeEnv === "production",
		dnsTimeout: 10_000,
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 30_000,
	});

/**
 * Provides the `Mailer` port. There is no health indicator on purpose: delivery is retried in
 * the background, so a mail outage must not take the api out of the load balancer.
 */
@Global()
@Module({
	providers: [
		{
			provide: MAIL_TRANSPORT,
			inject: [AppConfig],
			useFactory: createSmtpTransport,
		},
		{ provide: Mailer, useClass: SmtpMailer },
	],
	exports: [Mailer],
})
export class MailModule {}
