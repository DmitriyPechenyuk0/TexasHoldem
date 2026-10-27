import type { IncomingMessage } from "node:http";
import {
	type CanActivate,
	createParamDecorator,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { type Viewer, ViewerResolver } from "../application/viewer.js";

type RequestWithViewer = IncomingMessage & { viewer?: Viewer };

/** A socket.io client; the connection middleware (POK-66) keeps the viewer in its `data`. */
type SocketWithViewer = { readonly data?: { viewer?: Viewer } };

/** The viewer an earlier guard attached: to the HTTP request, or to the socket for a gateway handler. */
export function viewerOf(context: ExecutionContext): Viewer | undefined {
	return context.getType() === "ws"
		? context.switchToWs().getClient<SocketWithViewer>().data?.viewer
		: context.switchToHttp().getRequest<RequestWithViewer>().viewer;
}

/** Lets a request through only with a valid session (401 otherwise) and keeps its viewer for `@CurrentUser()`. */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly viewers: ViewerResolver) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<RequestWithViewer>();
		const viewer = await this.viewers.resolve(request.headers);
		if (!viewer) {
			throw new UnauthorizedException("Sign in to continue.");
		}
		request.viewer = viewer;
		return true;
	}
}

/** The signed-in user, in a handler behind `@UseGuards(AuthGuard)` (or a socket the connection middleware authenticated). */
export const CurrentUser = createParamDecorator(
	(_: unknown, context: ExecutionContext): Viewer => {
		const viewer = viewerOf(context);
		if (!viewer) {
			throw new Error("@CurrentUser() needs @UseGuards(AuthGuard)");
		}
		return viewer;
	},
);
