import type { DestinationStream } from "pino";

export type LogLine = Readonly<Record<string, unknown>>;

const listeners = new Set<(line: LogLine) => void>();

/**
 * Where every test app writes its JSON log lines, at debug level. nestjs-pino builds one pino-http
 * instance per process and keeps the destination and level of the first app that starts, so each
 * test app must use the same ones; lines nobody captures are dropped.
 */
export const testLogDestination: DestinationStream = {
	write(line: string) {
		if (listeners.size === 0) {
			return;
		}
		const parsed = JSON.parse(line) as LogLine;
		for (const listener of listeners) {
			listener(parsed);
		}
	},
};

/** Collects every log line written from now on, by any test app in this file. */
export function captureLogs(): { readonly lines: LogLine[] } {
	const lines: LogLine[] = [];
	listeners.add((line) => lines.push(line));
	return { lines };
}
