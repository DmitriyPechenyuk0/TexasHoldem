import type { EmailGreeting } from "../../../application/mailer.js";
import { type LocalizedCopy, greeting } from "./email-copy.js";

export const passwordChanged: LocalizedCopy<EmailGreeting & { url: string }> = {
	en: ({ username, url }) => ({
		subject: "Your Texas Hold'em password was changed",
		preview: "Every other device was signed out.",
		heading: "Your password was changed",
		paragraphs: [
			greeting(username, "en"),
			"The password of your account was just changed, and every other device was signed out.",
		],
		action: { label: "Review your account", url },
		notes: [
			"If this was you, there is nothing else to do.",
			"If it was not, reset your password from the sign-in page right away and check the ways to sign in in your account settings.",
		],
	}),
	ru: ({ username, url }) => ({
		subject: "Пароль в Техасском холдеме изменён",
		preview: "Все остальные устройства вышли из аккаунта.",
		heading: "Пароль изменён",
		paragraphs: [
			greeting(username, "ru"),
			"Пароль вашего аккаунта только что изменили, и все остальные устройства вышли из него.",
		],
		action: { label: "Проверить аккаунт", url },
		notes: [
			"Если это были вы, больше ничего делать не нужно.",
			"Если нет, сразу сбросьте пароль на странице входа и проверьте способы входа в настройках аккаунта.",
		],
	}),
};
