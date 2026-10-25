import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpProblem } from "./problem.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Refuses a state-changing request sent by a page on another origin than `webOrigin`. Browsers
 * always send `Origin` with such requests, and cookies ride along regardless of CORS, so without
 * this check a foreign page could sign a visitor in (login CSRF) or act in their name. Clients that
 * send no `Origin` are not browsers and carry no visitor's cookies, so they are let through.
 */
export const sameOriginOnly =
	(webOrigin: string) =>
	(request: IncomingMessage, _: ServerResponse, next: () => void): void => {
		const origin = request.headers.origin;
		if (
			SAFE_METHODS.has(request.method ?? "GET") ||
			origin === undefined ||
			origin === webOrigin
		) {
			next();
			return;
		}
		throw new HttpProblem(
			403,
			"request.cross-origin",
			"Requests that change state must come from the web app.",
		);
	};
