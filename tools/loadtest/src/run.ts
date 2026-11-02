// The load smoke test (POK-116): bots play many tables across two api instances, and the run
// reports latencies, errors, and each instance's CPU and memory. See ../README.md.
//
//   pnpm --filter @holdem/api build && pnpm --filter @holdem/loadtest start -- --tables 20 --minutes 10
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createDatabase, apiEnv, createPlayers } from "./accounts.ts";
import { Bot, type TableTracker } from "./bot.ts";
import { API_DIR, ApiInstance } from "./instances.ts";
import { parseOptions } from "./options.ts";
import { Recorder, summarize } from "./stats.ts";

const options = parseOptions(
	process.argv.slice(2).filter((arg) => arg !== "--"),
);
const env = await apiEnv();
const serverUrl = env.DATABASE_URL;
const origin = env.WEB_ORIGIN;
if (!serverUrl || !origin) {
	throw new Error(
		"DATABASE_URL and WEB_ORIGIN come from apps/api/.env or the environment",
	);
}
if (!existsSync(`${API_DIR}dist/main.js`)) {
	throw new Error("Build the api first: pnpm --filter @holdem/api build");
}

const log = (message: string) =>
	console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const recorder = new Recorder();
// 1/2 blinds: a 200-chip buy-in is the most the micro stakes allow (100 big blinds).
const BUY_IN = 200;

log(
	`${options.tables} tables × ${options.players} players for ${options.minutes} min`,
);
const database = await createDatabase(serverUrl);
const instances = options.ports.map(
	(port) =>
		new ApiInstance(port, {
			DATABASE_URL: database.url,
			// Where the api says it is, in the links it builds: each instance itself here.
			API_ORIGIN: `http://127.0.0.1:${port}`,
			TRUST_PROXY: "loopback",
			LOG_LEVEL: "warn",
		}),
);
let running = true;
const bots: Bot[] = [];
try {
	await Promise.all(instances.map((instance) => instance.ready()));
	log(`api instances ready on ${options.ports.join(" and ")}`);

	const players = await createPlayers(
		instances[0]!.url,
		origin,
		options.tables * options.players,
		(emails) => database.verify(emails),
	);
	log(`${players.length} players signed up and in`);

	const trackers: TableTracker[] = [];
	for (let table = 0; table < options.tables; table++) {
		const creator = players[table * options.players]!;
		const response = await fetch(
			`${instances[table % 2]!.url}/api/lobby/tables`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: origin,
					Cookie: creator.cookie,
					"X-Forwarded-For": creator.address,
				},
				body: JSON.stringify({
					name: `Load table ${table + 1}`,
					presetId: "micro",
					maxSeats: options.players,
					visibility: "public",
				}),
			},
		);
		if (!response.ok) {
			throw new Error(
				`Table not created: ${response.status} ${await response.text()}`,
			);
		}
		const { tableId } = (await response.json()) as { tableId: string };
		const tracker: TableTracker = {
			lastAction: null,
			lastProgressAt: performance.now(),
			hands: 0,
		};
		trackers.push(tracker);
		for (let seat = 0; seat < options.players; seat++) {
			const index = table * options.players + seat;
			const home = index % 2;
			const bot = new Bot(players[index]!, tableId, seat, tracker, {
				recorder,
				origin,
				thinkMs: options.thinkMs,
				buyIn: BUY_IN,
				running: () => running,
				fallbackUrl: () =>
					instances.find((instance) => !instance.stopped)?.url ??
					instances[home]!.url,
			});
			await bot.connect(instances[home]!.url);
			await bot.sit();
			bots.push(bot);
		}
	}
	log(`${bots.length} bots seated at ${trackers.length} tables; playing`);

	const sampler = setInterval(() => {
		for (const instance of instances) void instance.sample();
	}, 5_000);
	const durationMs = options.minutes * 60_000;
	const startedAt = performance.now();
	let killedAt: number | null = null;
	const recovered = new Set<number>();
	while (performance.now() - startedAt < durationMs) {
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		const elapsed = performance.now() - startedAt;
		if (options.chaos && killedAt === null && elapsed >= durationMs / 2) {
			instances[1]!.kill();
			killedAt = performance.now();
			log(`killed the api on ${instances[1]!.port}`);
		}
		if (killedAt !== null) {
			trackers.forEach((tracker, index) => {
				if (!recovered.has(index) && tracker.lastProgressAt > killedAt!) {
					recovered.add(index);
					recorder.latency(
						"table recovery",
						tracker.lastProgressAt - killedAt!,
					);
				}
			});
		}
		if (
			Math.floor(elapsed / 60_000) !== Math.floor((elapsed - 1_000) / 60_000)
		) {
			const hands = trackers.reduce(
				(total, tracker) => total + tracker.hands,
				0,
			);
			log(`${Math.round(elapsed / 60_000)} min: ${hands} hands dealt`);
		}
	}
	clearInterval(sampler);
	running = false;

	const now = performance.now();
	const stalled = trackers.filter(
		(tracker) => now - tracker.lastProgressAt > 60_000,
	);
	if (options.chaos && recovered.size < trackers.length) {
		recorder.count("tables not recovered", trackers.length - recovered.size);
	}
	if (stalled.length > 0) recorder.count("tables stalled", stalled.length);
	const hands = trackers.reduce((total, tracker) => total + tracker.hands, 0);
	const report = {
		options,
		hands,
		...recorder.summary(),
		instances: instances.map((instance) => ({
			port: instance.port,
			cpuPercent: summarize(instance.cpuPercent),
			rssMb: summarize(instance.rssMb),
		})),
	};
	const resultsDir = new URL("../results/", import.meta.url);
	await mkdir(resultsDir, { recursive: true });
	const file = new URL(
		`run-${new Date().toISOString().replaceAll(":", "-")}.json`,
		resultsDir,
	);
	await writeFile(file, `${JSON.stringify(report, null, "\t")}\n`);
	printReport(report);
	log(`results in ${file.pathname}`);
} finally {
	running = false;
	for (const bot of bots) bot.close();
	await Promise.all(instances.map((instance) => instance.stop()));
	await database.drop();
}

function printReport(report: {
	hands: number;
	latencies: Readonly<Record<string, ReturnType<typeof summarize>>>;
	counts: Readonly<Record<string, number>>;
	instances: readonly {
		port: number;
		cpuPercent: ReturnType<typeof summarize>;
		rssMb: ReturnType<typeof summarize>;
	}[];
}): void {
	const ms = (value: number) => `${value.toFixed(1)} ms`;
	console.log(`\nHands dealt: ${report.hands}\n`);
	console.log("| Latency | Count | p50 | p95 | p99 | Max |");
	console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
	for (const [kind, { count, p50, p95, p99, max }] of Object.entries(
		report.latencies,
	)) {
		console.log(
			`| ${kind} | ${count} | ${ms(p50)} | ${ms(p95)} | ${ms(p99)} | ${ms(max)} |`,
		);
	}
	console.log("\n| Instance | CPU p50 | CPU max | RSS p50 | RSS max |");
	console.log("| --- | ---: | ---: | ---: | ---: |");
	for (const { port, cpuPercent, rssMb } of report.instances) {
		console.log(
			`| ${port} | ${cpuPercent.p50.toFixed(0)} % | ${cpuPercent.max.toFixed(0)} % | ${rssMb.p50.toFixed(0)} MB | ${rssMb.max.toFixed(0)} MB |`,
		);
	}
	console.log(
		"\nCounts:",
		Object.keys(report.counts).length === 0 ? "none" : "",
	);
	for (const [what, count] of Object.entries(report.counts)) {
		console.log(`- ${what}: ${count}`);
	}
}
