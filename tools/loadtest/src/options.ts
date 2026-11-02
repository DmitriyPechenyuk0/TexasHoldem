import { parseArgs } from "node:util";

export interface Options {
	/** Tables to open and fill. */
	readonly tables: number;
	/** Players at each table. */
	readonly players: number;
	/** How long the bots play, once every table is full. */
	readonly minutes: number;
	/** How long a bot thinks before acting, in milliseconds: picked between the two at random. */
	readonly thinkMs: readonly [number, number];
	/** Kill one instance halfway through, and measure how the tables recover on the other. */
	readonly chaos: boolean;
	/** Where the two api instances listen. */
	readonly ports: readonly [number, number];
}

const positive = (name: string, value: string): number => {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) {
		throw new Error(`--${name} takes a positive number, got ${value}`);
	}
	return number;
};

/** The command line, e.g. `--tables 20 --players 6 --minutes 10 --think 200-800 --chaos`. */
export function parseOptions(args: readonly string[]): Options {
	const { values } = parseArgs({
		args: [...args],
		options: {
			tables: { type: "string", default: "20" },
			players: { type: "string", default: "6" },
			minutes: { type: "string", default: "10" },
			think: { type: "string", default: "200-800" },
			chaos: { type: "boolean", default: false },
			port: { type: "string", default: "4101" },
		},
		strict: true,
	});
	const players = positive("players", values.players);
	if (!Number.isInteger(players) || players < 2 || players > 9) {
		throw new Error(`--players takes 2 to 9, got ${values.players}`);
	}
	const think = /^(\d+)-(\d+)$/.exec(values.think);
	if (!think || Number(think[1]) > Number(think[2])) {
		throw new Error(
			`--think takes a range such as 200-800, got ${values.think}`,
		);
	}
	const port = positive("port", values.port);
	return {
		tables: Math.trunc(positive("tables", values.tables)),
		players,
		minutes: positive("minutes", values.minutes),
		thinkMs: [Number(think[1]), Number(think[2])],
		chaos: values.chaos,
		ports: [port, port + 1],
	};
}
