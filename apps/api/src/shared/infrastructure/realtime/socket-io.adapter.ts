import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { Server, ServerOptions } from "socket.io";
import type { AppConfig } from "../config/index.js";

/** socket.io on the api's HTTP server, accepting connections from the web app's origin with cookies. */
export class SocketIoAdapter extends IoAdapter {
	constructor(
		app: INestApplicationContext,
		private readonly config: AppConfig,
	) {
		super(app);
	}

	override createIOServer(port: number, options?: ServerOptions): Server {
		const withCors: Partial<ServerOptions> = {
			...options,
			cors: { origin: this.config.webOrigin, credentials: true },
		};
		// socket.io takes partial options (`new Server(server, Partial<ServerOptions>)`), and so does
		// IoAdapter at runtime; only its declared parameter type lists every field as required.
		return super.createIOServer(port, withCors as ServerOptions);
	}
}
