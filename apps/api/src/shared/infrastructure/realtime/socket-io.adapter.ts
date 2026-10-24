import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { Server, ServerOptions } from "socket.io";
import type { AppConfig } from "../config/index.js";

/** The largest message a client may send. Game commands are a few hundred bytes. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** socket.io on the api's HTTP server, accepting connections from the web app's origin with cookies. */
export class SocketIoAdapter extends IoAdapter {
	constructor(
		app: INestApplicationContext,
		private readonly config: AppConfig,
	) {
		super(app);
	}

	override createIOServer(port: number, options?: ServerOptions): Server {
		const { webOrigin } = this.config;
		const withCors: Partial<ServerOptions> = {
			...options,
			cors: { origin: webOrigin, credentials: true },
			// CORS only tells a browser which responses a page may read: it does not stop a page on
			// another origin from opening a socket that carries the visitor's cookies (cross-site
			// WebSocket hijacking). Browsers always send Origin, so a foreign one is refused. A client
			// without one is not a browser and has no visitor's cookies to borrow.
			allowRequest: (request, callback) => {
				const { origin } = request.headers;
				callback(null, origin === undefined || origin === webOrigin);
			},
			maxHttpBufferSize: MAX_MESSAGE_BYTES,
		};
		// socket.io takes partial options (`new Server(server, Partial<ServerOptions>)`), and so does
		// IoAdapter at runtime; only its declared parameter type lists every field as required.
		return super.createIOServer(port, withCors as ServerOptions);
	}
}
