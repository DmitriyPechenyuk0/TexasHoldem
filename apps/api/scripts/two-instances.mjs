// Runs two api instances behind a round-robin TCP proxy, to try the app as it runs in production:
// rooms reach sockets on both instances through Redis (POK-78). Build first (`pnpm build`), with
// Postgres and Redis up (`pnpm infra:up` at the root).
//
//   pnpm start:two                   the proxy on PORT (4000), the instances on 4001 and 4002
//
// Every connection goes to the next instance in turn. Sockets are WebSocket only, so a connection
// stays where it landed and no sticky sessions are needed.
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";

const proxyPort = Number(process.env.PORT ?? 4000);
const ports = [proxyPort + 1, proxyPort + 2];

const instances = ports.map((port) => {
	const child = spawn(
		process.execPath,
		["--env-file-if-exists=.env", "dist/main.js"],
		{
			env: { ...process.env, PORT: String(port) },
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	for (const stream of [child.stdout, child.stderr]) {
		stream.on("data", (chunk) => {
			for (const line of String(chunk).trimEnd().split("\n")) {
				console.log(`[${port}] ${line}`);
			}
		});
	}
	child.on("exit", (code) => {
		console.log(`[${port}] exited with ${code}`);
		shutDown(code ?? 1);
	});
	return child;
});

let next = 0;
const proxy = createServer((client) => {
	const port = ports[next];
	next = (next + 1) % ports.length;
	const upstream = createConnection({ host: "127.0.0.1", port });
	client.pipe(upstream).pipe(client);
	client.on("error", () => upstream.destroy());
	upstream.on("error", () => client.destroy());
});
proxy.listen(proxyPort, () => {
	console.log(`proxy on :${proxyPort} → instances on :${ports.join(" and :")}`);
});

let stopping = false;
function shutDown(code = 0) {
	if (stopping) return;
	stopping = true;
	proxy.close();
	for (const child of instances) child.kill("SIGTERM");
	setTimeout(() => process.exit(code), 11_000).unref();
}
process.on("SIGINT", () => shutDown());
process.on("SIGTERM", () => shutDown());
