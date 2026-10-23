import net from "node:net";

/**
 * Forwards a local port to a real service, so a test can take the service "down" and bring it
 * back on the same address without touching the shared docker compose container.
 */
export class TcpProxy {
	private server: net.Server | undefined;
	private readonly sockets = new Set<net.Socket>();
	private port = 0;

	constructor(
		private readonly target: { readonly host: string; readonly port: number },
	) {}

	get url(): string {
		return `redis://127.0.0.1:${this.port}`;
	}

	/** Listens on a free port the first time, then on the same port again. */
	async start(): Promise<void> {
		const server = net.createServer((client) => {
			const upstream = net.connect(this.target.port, this.target.host);
			for (const socket of [client, upstream]) {
				this.sockets.add(socket);
				socket.on("close", () => this.sockets.delete(socket));
				socket.on("error", () => {
					client.destroy();
					upstream.destroy();
				});
			}
			client.pipe(upstream).pipe(client);
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(this.port, "127.0.0.1", () => resolve());
		});
		this.port = (server.address() as net.AddressInfo).port;
		this.server = server;
	}

	/** Drops every open connection and stops listening, like a crashed service. */
	async stop(): Promise<void> {
		for (const socket of this.sockets) {
			socket.destroy();
		}
		const server = this.server;
		this.server = undefined;
		await new Promise<void>((resolve) => {
			if (server) {
				server.close(() => resolve());
			} else {
				resolve();
			}
		});
	}
}
