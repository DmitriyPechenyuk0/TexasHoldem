/** Mailpit's HTTP API from `pnpm infra:up`, next to the SMTP server in `.env.example`. */
const MAILPIT_API = "http://127.0.0.1:8025/api/v1";

export interface MailpitAddress {
	readonly Name: string;
	readonly Address: string;
}

export interface MailpitMessage {
	readonly ID: string;
	readonly From: MailpitAddress;
	readonly To: readonly MailpitAddress[];
	readonly Subject: string;
	readonly HTML: string;
	readonly Text: string;
}

async function getJson<T>(path: string): Promise<T> {
	const response = await fetch(`${MAILPIT_API}${path}`);
	if (!response.ok) {
		throw new Error(`Mailpit answered ${response.status} for ${path}`);
	}
	return (await response.json()) as T;
}

/**
 * Polls Mailpit until an email to `to` arrives: delivery runs in the background, so it is never
 * there the moment `send` returns. Use a unique address per test, since the inbox is shared.
 */
export async function waitForEmail(
	to: string,
	timeoutMs = 10_000,
): Promise<
	MailpitMessage & { readonly headers: Readonly<Record<string, string[]>> }
> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const { messages } = await getJson<{
			messages: readonly { readonly ID: string }[];
		}>(`/search?query=${encodeURIComponent(`to:"${to}"`)}`);
		const [found] = messages;
		if (found) {
			const [message, headers] = await Promise.all([
				getJson<MailpitMessage>(`/message/${found.ID}`),
				getJson<Record<string, string[]>>(`/message/${found.ID}/headers`),
			]);
			return { ...message, headers };
		}
		if (Date.now() > deadline) {
			throw new Error(`No email to ${to} arrived within ${timeoutMs} ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/** How many emails to `to` Mailpit holds now. */
export async function countEmails(to: string): Promise<number> {
	const { messages_count: count } = await getJson<{ messages_count: number }>(
		`/search?query=${encodeURIComponent(`to:"${to}"`)}`,
	);
	return count;
}

/** Polls until Mailpit holds `count` emails to `to`. */
export async function waitForEmailCount(
	to: string,
	count: number,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while ((await countEmails(to)) < count) {
		if (Date.now() > deadline) {
			throw new Error(
				`Fewer than ${count} emails to ${to} within ${timeoutMs} ms`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/**
 * Polls Mailpit until an email to `to` holds a link that matches `pattern`, newest first, and
 * returns it. For addresses that get more than one kind of email.
 */
export async function waitForLink(
	to: string,
	pattern: RegExp,
	timeoutMs = 10_000,
): Promise<URL> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const { messages } = await getJson<{
			messages: readonly { readonly ID: string }[];
		}>(`/search?query=${encodeURIComponent(`to:"${to}"`)}`);
		for (const { ID } of messages) {
			const { Text } = await getJson<MailpitMessage>(`/message/${ID}`);
			const link = pattern.exec(Text)?.[0];
			if (link) {
				return new URL(link);
			}
		}
		if (Date.now() > deadline) {
			throw new Error(
				`No link like ${pattern} reached ${to} within ${timeoutMs} ms`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}
