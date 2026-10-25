import type { Locale } from "@holdem/shared/contracts/common";
import type { EmailCopy } from "./email-copy.js";

export interface RenderedEmail {
	readonly subject: string;
	readonly html: string;
	readonly text: string;
}

const LAYOUT_COPY: Readonly<
	Record<
		Locale,
		{
			readonly appName: string;
			readonly linkFallback: string;
			readonly automated: string;
		}
	>
> = {
	en: {
		appName: "Texas Hold'em",
		linkFallback: "If the button does not work, open this link:",
		automated: "This email was sent automatically. Replies are not read.",
	},
	ru: {
		appName: "Техасский холдем",
		linkFallback: "Если кнопка не работает, откройте ссылку:",
		automated:
			"Это письмо отправлено автоматически, ответы на него не читаются.",
	},
};

const ESCAPES: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** Safe both in element content and in quoted attribute values. */
export const escapeHtml = (value: string): string =>
	value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** Only web links: anything else in an `href` (such as `javascript:`) is a bug upstream. */
function assertWebLink(url: string): void {
	if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
		throw new Error("Email links must be absolute http(s) URLs");
	}
}

// The web app's colour tokens (apps/web globals.css: zinc and emerald) in hex, since email clients
// understand neither oklch nor custom properties.
const LIGHT = {
	page: "#fafafa",
	card: "#ffffff",
	border: "#e4e4e7",
	heading: "#18181b",
	text: "#3f3f46",
	muted: "#71717b",
	faint: "#9f9fa9",
	primary: "#007a55",
	onPrimary: "#ffffff",
};
const DARK: typeof LIGHT = {
	page: "#09090b",
	card: "#18181b",
	border: "#27272a",
	heading: "#fafafa",
	text: "#d4d4d8",
	muted: "#9f9fa9",
	faint: "#71717b",
	primary: "#00bc7d",
	onPrimary: "#09090b",
};
const FONT =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** ♠ with the text presentation selector, so phones do not draw it as an emoji. */
const SPADE = "&#9824;&#65038;";

// Styles are inline, because many clients drop <style> or the styles of <body>; the classes only
// let clients that do support <style> switch to dark colours and tighten spacing on phones.
const STYLE = `<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
.e-page { background: ${DARK.page} !important; }
.e-card { background: ${DARK.card} !important; border-color: ${DARK.border} !important; }
.e-divider { border-color: ${DARK.border} !important; }
.e-heading { color: ${DARK.heading} !important; }
.e-text { color: ${DARK.text} !important; }
.e-muted, .e-muted a { color: ${DARK.muted} !important; }
.e-faint { color: ${DARK.faint} !important; }
.e-mark, .e-button { background: ${DARK.primary} !important; color: ${DARK.onPrimary} !important; }
}
@media (max-width: 520px) {
.e-outer { padding: 16px 12px !important; }
.e-pad { padding-left: 24px !important; padding-right: 24px !important; }
}
</style>`;

const paragraph = (text: string, className: string, style: string): string =>
	`<p class="${className}" style="margin:0 0 16px;${style}">${escapeHtml(text)}</p>`;

/** Renders the copy as a complete email. Every value from the copy is escaped. */
export function renderLayout(copy: EmailCopy, locale: Locale): RenderedEmail {
	assertWebLink(copy.action.url);
	const layout = LAYOUT_COPY[locale];
	const url = escapeHtml(copy.action.url);
	const c = LIGHT;

	const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(copy.subject)}</title>
${STYLE}
</head>
<body class="e-page" style="margin:0;padding:0;background:${c.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.preview)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" class="e-page" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page};font-family:${FONT};">
<tr><td class="e-outer" align="center" style="padding:40px 16px;">
<table role="presentation" class="e-card" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${c.card};border:1px solid ${c.border};border-radius:12px;">
<tr><td class="e-pad" style="padding:36px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td class="e-mark" width="28" height="28" align="center" style="width:28px;height:28px;border-radius:7px;background:${c.primary};color:${c.onPrimary};font-size:19px;line-height:28px;">${SPADE}</td>
<td class="e-heading" style="padding-left:10px;color:${c.heading};font-size:15px;line-height:20px;font-weight:600;">${escapeHtml(layout.appName)}</td>
</tr></table>
<h1 class="e-heading" style="margin:32px 0 16px;color:${c.heading};font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(copy.heading)}</h1>
${copy.paragraphs.map((text) => paragraph(text, "e-text", `color:${c.text};font-size:16px;line-height:26px;`)).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 32px;"><tr>
<td class="e-button" style="border-radius:8px;background:${c.primary};"><a class="e-button" href="${url}" style="display:inline-block;padding:13px 24px;border-radius:8px;background:${c.primary};color:${c.onPrimary};font-size:15px;line-height:20px;font-weight:600;text-decoration:none;">${escapeHtml(copy.action.label)}</a></td>
</tr></table>
</td></tr>
<tr><td class="e-pad e-divider" style="padding:24px 40px 28px;border-top:1px solid ${c.border};">
${copy.notes.map((text) => paragraph(text, "e-muted", `color:${c.muted};font-size:14px;line-height:22px;margin-bottom:8px;`)).join("\n")}
<p class="e-muted" style="margin:16px 0 0;color:${c.muted};font-size:13px;line-height:20px;">${escapeHtml(layout.linkFallback)}<br><a href="${url}" style="color:${c.muted};text-decoration:underline;word-break:break-all;">${url}</a></p>
</td></tr>
</table>
<p class="e-faint" style="margin:24px 0 0;color:${c.faint};font-size:12px;line-height:18px;">${escapeHtml(layout.automated)}</p>
</td></tr>
</table>
</body>
</html>
`;

	const text = [
		layout.appName,
		copy.heading,
		...copy.paragraphs,
		`${copy.action.label}:\n${copy.action.url}`,
		...copy.notes,
		`--\n${layout.automated}`,
	].join("\n\n");

	return { subject: copy.subject, html, text: `${text}\n` };
}
