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
