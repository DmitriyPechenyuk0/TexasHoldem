import net from "node:net";

export interface TcpProxyOptions {
	/** Holds every new connection this long before reaching the target, like a slow network. */
	readonly connectDelayMs?: number;
}

/**
 * Forwards a local port to a real service, so a test can take the service "down", bring it back on
 * the same address or slow it down, without touching the shared docker compose container.
 */
export class TcpProxy {
	private server: net.Server | undefined;
	private readonly sockets = new Set<net.Socket>();
	private port = 0;

	constructor(
		private readonly target: { readonly host: string; readonly port: number },
		private readonly options: TcpProxyOptions = {},
	) {}

	get url(): string {
		return `redis://127.0.0.1:${this.port}`;
	}

	/** The port on 127.0.0.1 that forwards to the target, once started. */
	get localPort(): number {
		return this.port;
	}

	/** Listens on a free port the first time, then on the same port again. */
	async start(): Promise<void> {
		const server = net.createServer((client) => {
			this.track(client);
			const forward = () => {
				const upstream = net.connect(this.target.port, this.target.host);
				this.track(upstream);
				upstream.on("error", () => client.destroy());
				client.on("error", () => upstream.destroy());
				client.pipe(upstream).pipe(client);
				client.resume();
			};

			const delay = this.options.connectDelayMs ?? 0;
			if (delay === 0) {
				forward();
				return;
			}
			client.pause();
			const timer = setTimeout(forward, delay);
			client.once("close", () => clearTimeout(timer));
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

	private track(socket: net.Socket): void {
		this.sockets.add(socket);
		socket.on("close", () => this.sockets.delete(socket));
		socket.on("error", () => socket.destroy());
	}
}
