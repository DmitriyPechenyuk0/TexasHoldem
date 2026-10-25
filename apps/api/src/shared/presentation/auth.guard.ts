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

/** The signed-in user, in a handler behind `@UseGuards(AuthGuard)`. */
export const CurrentUser = createParamDecorator(
	(_: unknown, context: ExecutionContext): Viewer => {
		const { viewer } = context.switchToHttp().getRequest<RequestWithViewer>();
		if (!viewer) {
			throw new Error("@CurrentUser() needs @UseGuards(AuthGuard)");
		}
		return viewer;
	},
);
