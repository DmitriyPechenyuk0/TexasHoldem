import { LOCALES } from "@holdem/shared/contracts/common";
import type { EmailContent } from "../../../application/mailer.js";
import { formatDuration } from "./email-copy.js";
import { escapeHtml } from "./layout.js";
import { renderEmail, resolveLocale } from "./render-email.js";

const url =
	"https://holdem.example/api/auth/verify-email?token=abc&callbackURL=%2F";

const verify = (
	params: Partial<
		Extract<EmailContent, { template: "verify-email" }>["params"]
	> = {},
): EmailContent => ({
	template: "verify-email",
	params: { username: "alice", url, expiresInMinutes: 24 * 60, ...params },
});

const settings = "https://holdem.example/en/settings?tab=account";

const reset = (): EmailContent => ({
	template: "reset-password",
	params: { username: "alice", url, expiresInMinutes: 30 },
});

describe("renderEmail", () => {
	it.each([
		[
			"verify-email",
			"en",
			verify(),
			"Confirm your email for Texas Hold'em",
			"24 hours",
		],
		[
			"verify-email",
			"ru",
			verify(),
			"Подтвердите почту для Техасского холдема",
			"24 часа",
		],
		[
			"reset-password",
			"en",
			reset(),
			"Reset your Texas Hold'em password",
			"30 minutes",
		],
		[
			"reset-password",
			"ru",
			reset(),
			"Сброс пароля в Техасском холдеме",
			"30 минут",
		],
	] as const)("renders %s in %s", (_, locale, content, subject, validFor) => {
		const email = renderEmail(content, locale);

		expect(email.subject).toBe(subject);
		expect(email.html).toContain(`<html lang="${locale}">`);
		expect(email.html).toContain(`<title>${escapeHtml(subject)}</title>`);
		// Once on the button and once as the fallback link.
		expect(email.html.split(`href="${escapeHtml(url)}"`)).toHaveLength(3);
		expect(email.html).toContain(validFor);
		expect(email.html).toContain("alice");

		expect(email.text).toContain(url);
		expect(email.text).toContain(validFor);
		expect(email.text).toContain("alice");
		expect(email.text).not.toMatch(/<[a-z/]/i);
	});

	it("hides the inbox preview in the HTML and adapts it to dark mode", () => {
		const { html, text } = renderEmail(verify(), "ru");

		expect(html).toMatch(
			/<div style="display:none;[^"]*">Один клик, и регистрация завершена\./,
		);
		expect(text).not.toContain("Один клик");
		expect(html).toContain('<meta name="color-scheme" content="light dark">');
		expect(html).toContain("@media (prefers-color-scheme: dark)");
	});

	it("lays out the text version as plain paragraphs", () => {
		expect(renderEmail(verify(), "en").text).toMatchInlineSnapshot(`
			"Texas Hold'em

			Confirm your email

			Hi alice,

			Thanks for signing up. Confirm your email address to finish creating your account and sign in.

			Confirm email:
			https://holdem.example/api/auth/verify-email?token=abc&callbackURL=%2F

			The link works for 24 hours.

			If you did not sign up for Texas Hold'em, ignore this email.

			--
			This email was sent automatically. Replies are not read.
			"
		`);
	});

	it("falls back to English for an unsupported or missing locale", () => {
		const english = renderEmail(verify(), "en");

		expect(renderEmail(verify(), "de")).toEqual(english);
		expect(renderEmail(verify(), undefined)).toEqual(english);
		expect(renderEmail(verify(), "ru-RU")).toEqual(renderEmail(verify(), "ru"));
	});

	it("escapes every value it puts into the HTML", () => {
		const email = renderEmail(
			verify({
				username: `<img src=x onerror="alert(1)">`,
				url: `https://holdem.example/?a=1&b="><script>`,
			}),
			"en",
		);

		expect(email.html).not.toContain("<img");
		expect(email.html).not.toContain("<script>");
		expect(email.html).toContain(
			"&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
		);
		expect(email.html).toContain(
			`href="https://holdem.example/?a=1&amp;b=&quot;&gt;&lt;script&gt;"`,
		);
		// The text version is not HTML, so it keeps values as they are.
		expect(email.text).toContain(`<img src=x onerror="alert(1)">`);
	});

	it("greets without a name before the account has a username", () => {
		const en = renderEmail(verify({ username: null }), "en");
		const ru = renderEmail(verify({ username: null }), "ru");

		expect(en.text).toContain("\n\nHi,\n\n");
		expect(ru.text).toContain("\n\nЗдравствуйте!\n\n");
	});

	it.each([
		["en", "Your Texas Hold'em password was changed", "Review your account"],
		["ru", "Пароль в Техасском холдеме изменён", "Проверить аккаунт"],
	] as const)("renders password-changed in %s", (locale, subject, action) => {
		const email = renderEmail(
			{
				template: "password-changed",
				params: { username: "alice", url: settings },
			},
			locale,
		);

		expect(email.subject).toBe(subject);
		expect(email.text).toContain(`${action}:\n${settings}`);
		expect(email.text).toContain("alice");
	});

	it.each([
		[
			"en",
			"GitHub can now sign in to your Texas Hold'em account",
			"unlink GitHub",
		],
		[
			"ru",
			"Теперь GitHub входит в ваш аккаунт Техасского холдема",
			"отвяжите GitHub",
		],
	] as const)(
		"renders sign-in-method-added in %s",
		(locale, subject, advice) => {
			const email = renderEmail(
				{
					template: "sign-in-method-added",
					params: { username: null, provider: "GitHub", url: settings },
				},
				locale,
			);

			expect(email.subject).toBe(subject);
			expect(email.text).toContain(settings);
			expect(email.text).toContain(advice);
		},
	);

	it.each(["javascript:alert(1)", "/api/auth/verify-email", "mailto:a@b.c"])(
		"refuses %s as a link",
		(link) => {
			expect(() => renderEmail(verify({ url: link }), "en")).toThrow(
				"Email links must be absolute http(s) URLs",
			);
		},
	);
});

describe("resolveLocale", () => {
	it.each([
		["ru", "ru"],
		["ru-RU", "ru"],
		["RU", "ru"],
		["en_GB", "en"],
		["de", "en"],
		["", "en"],
		[undefined, "en"],
	])("%s → %s", (locale, expected) => {
		expect(resolveLocale(locale)).toBe(expected);
	});

	it("covers every supported locale", () => {
		expect(LOCALES.map((locale) => resolveLocale(locale))).toEqual(LOCALES);
	});
});

describe("formatDuration", () => {
	it.each([
		[60, "en", "1 hour"],
		[90, "en", "90 minutes"],
		[24 * 60, "ru", "24 часа"],
		[60, "ru", "1 час"],
		[5, "ru", "5 минут"],
		[21, "ru", "21 минута"],
	] as const)("%i minutes in %s is %s", (minutes, locale, expected) => {
		expect(formatDuration(minutes, locale)).toBe(expected);
	});
});
