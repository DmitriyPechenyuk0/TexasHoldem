import type { EmailGreeting, EmailLink } from "../../../application/mailer.js";
import { type LocalizedCopy, formatDuration, greeting } from "./email-copy.js";

export const resetPassword: LocalizedCopy<EmailLink & EmailGreeting> = {
	en: ({ username, url, expiresInMinutes }) => ({
		subject: "Reset your Texas Hold'em password",
		preview: "Choose a new password for your account.",
		heading: "Reset your password",
		paragraphs: [
			greeting(username, "en"),
			"We received a request to reset the password for your account. Choose a new one with the button below.",
		],
		action: { label: "Choose a new password", url },
		notes: [
			`The link works once, for ${formatDuration(expiresInMinutes, "en")}.`,
			"If you did not ask for this, ignore this email: your password stays the same.",
		],
	}),
	ru: ({ username, url, expiresInMinutes }) => ({
		subject: "Сброс пароля в Техасском холдеме",
		preview: "Задайте новый пароль для своего аккаунта.",
		heading: "Сброс пароля",
		paragraphs: [
			greeting(username, "ru"),
			"Мы получили запрос на сброс пароля для вашего аккаунта. Задайте новый пароль по кнопке ниже.",
		],
		action: { label: "Задать новый пароль", url },
		notes: [
			`Ссылка действует ${formatDuration(expiresInMinutes, "ru")} и срабатывает один раз.`,
			"Если вы не запрашивали сброс, проигнорируйте это письмо: пароль останется прежним.",
		],
	}),
};
