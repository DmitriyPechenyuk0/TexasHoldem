import type { EmailLink } from "../../../application/mailer.js";
import { type LocalizedCopy, formatDuration } from "./email-copy.js";

export const verifyEmail: LocalizedCopy<EmailLink & { username: string }> = {
	en: ({ username, url, expiresInMinutes }) => ({
		subject: "Confirm your email for Texas Hold'em",
		preview: "One click to finish signing up.",
		heading: "Confirm your email",
		paragraphs: [
			`Hi ${username},`,
			"Thanks for signing up. Confirm your email address to finish creating your account and sign in.",
		],
		action: { label: "Confirm email", url },
		notes: [
			`The link works for ${formatDuration(expiresInMinutes, "en")}.`,
			"If you did not sign up for Texas Hold'em, ignore this email.",
		],
	}),
	ru: ({ username, url, expiresInMinutes }) => ({
		subject: "Подтвердите почту для Техасского холдема",
		preview: "Один клик, и регистрация завершена.",
		heading: "Подтвердите почту",
		paragraphs: [
			`Здравствуйте, ${username}!`,
			"Спасибо за регистрацию. Подтвердите адрес почты, чтобы завершить создание аккаунта и войти.",
		],
		action: { label: "Подтвердить почту", url },
		notes: [
			`Ссылка действует ${formatDuration(expiresInMinutes, "ru")}.`,
			"Если вы не регистрировались в Техасском холдеме, просто проигнорируйте это письмо.",
		],
	}),
};
