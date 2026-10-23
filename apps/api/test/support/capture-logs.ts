import type { DestinationStream } from "pino";

export type LogLine = Readonly<Record<string, unknown>>;

/** A pino destination that keeps every JSON line in memory, for tests that read the logs. */
export function captureLogs(): {
	readonly destination: DestinationStream;
	readonly lines: LogLine[];
} {
	const lines: LogLine[] = [];
	return {
		destination: {
			write: (line: string) => {
				lines.push(JSON.parse(line) as LogLine);
			},
		},
		lines,
	};
}
