import type { EmailGreeting } from "../../../application/mailer.js";
import { type LocalizedCopy, greeting } from "./email-copy.js";

export const signInMethodAdded: LocalizedCopy<
	EmailGreeting & { provider: string; url: string }
> = {
	en: ({ username, provider, url }) => ({
		subject: `${provider} can now sign in to your Texas Hold'em account`,
		preview: `A ${provider} account was linked to yours.`,
		heading: "A new way to sign in",
		paragraphs: [
			greeting(username, "en"),
			`A ${provider} account was just linked to yours. From now on it signs in to your account too.`,
		],
		action: { label: "Review the ways to sign in", url },
		notes: [
			"If this was you, there is nothing else to do.",
			`If it was not, unlink ${provider} in your account settings and change your password right away.`,
		],
	}),
	ru: ({ username, provider, url }) => ({
		subject: `Теперь ${provider} входит в ваш аккаунт Техасского холдема`,
		preview: `К вашему аккаунту привязан аккаунт ${provider}.`,
		heading: "Новый способ входа",
		paragraphs: [
			greeting(username, "ru"),
			`К вашему аккаунту только что привязали аккаунт ${provider}. Теперь через него тоже можно войти.`,
		],
		action: { label: "Проверить способы входа", url },
		notes: [
			"Если это были вы, больше ничего делать не нужно.",
			`Если нет, сразу отвяжите ${provider} в настройках аккаунта и смените пароль.`,
		],
	}),
};
