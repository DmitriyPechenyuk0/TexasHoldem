import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** The api's directory: its built `dist/main.js` and its `.env`. */
export const API_DIR = fileURLToPath(
	new URL("../../../apps/api/", import.meta.url),
);

/** Linux schedules CPU time in ticks of 1/100 s (`getconf CLK_TCK`). */
const TICKS_PER_SECOND = 100;

/** One api instance this run started, with its CPU and memory as `/proc` tells them. */
export class ApiInstance {
	readonly port: number;
	readonly url: string;
	private readonly child: ChildProcess;
	private lastTicks = 0;
	private lastAt = Date.now();
	readonly cpuPercent: number[] = [];
	readonly rssMb: number[] = [];
	stopped = false;
	private exited = false;

	constructor(port: number, env: Readonly<Record<string, string>>) {
		this.port = port;
		this.url = `http://127.0.0.1:${port}`;
		this.child = spawn(
			process.execPath,
			["--env-file-if-exists=.env", "dist/main.js"],
			{
				cwd: API_DIR,
				env: { ...process.env, ...env, PORT: String(port) },
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		this.child.once("exit", () => {
			this.exited = true;
		});
		this.child.stderr?.on("data", (chunk) => {
			process.stderr.write(`[api ${port}] ${String(chunk)}`);
		});
	}

	/** Resolves once the instance answers its readiness check. */
	async ready(timeoutMs = 30_000): Promise<void> {
		const until = Date.now() + timeoutMs;
		while (Date.now() < until && !this.exited) {
			const ok = await fetch(`${this.url}/api/health/ready`)
				.then((response) => response.ok)
				.catch(() => false);
			if (ok) return;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(`The api on ${this.port} did not get ready`);
	}

	/** Samples CPU (since the last sample) and resident memory. */
	async sample(): Promise<void> {
		const pid = this.child.pid;
		if (this.stopped || pid === undefined) return;
		try {
			const stat = (await readFile(`/proc/${pid}/stat`, "utf8"))
				.split(") ")[1]!
				.split(" ");
			// After the command name: utime and stime are fields 14 and 15 of the whole line.
			const ticks = Number(stat[11]) + Number(stat[12]);
			const now = Date.now();
			if (this.lastTicks > 0) {
				const cpuSeconds = (ticks - this.lastTicks) / TICKS_PER_SECOND;
				this.cpuPercent.push((100 * cpuSeconds) / ((now - this.lastAt) / 1000));
			}
			this.lastTicks = ticks;
			this.lastAt = now;
			const status = await readFile(`/proc/${pid}/status`, "utf8");
			const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
			this.rssMb.push(rssKb / 1024);
		} catch {
			// The process is gone; the samples so far stand.
		}
	}

	/** SIGKILL: the instance stops as a crash would, without closing anything. */
	kill(): void {
		this.stopped = true;
		this.child.kill("SIGKILL");
	}

	async stop(): Promise<void> {
		this.stopped = true;
		if (this.exited) return;
		const exited = new Promise((resolve) => this.child.once("exit", resolve));
		this.child.kill("SIGTERM");
		await exited;
	}
}
