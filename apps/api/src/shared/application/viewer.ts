import type { UserId } from "@holdem/shared";

/** Who sends a request: the user behind a valid session. Identity is the one context that knows how. */
export interface Viewer {
	readonly userId: UserId;
	readonly username: string;
	readonly emailVerified: boolean;
}

export type RequestHeaders = Readonly<
	Record<string, string | readonly string[] | undefined>
>;

/** Port for the viewer behind a request's session cookie; identity provides the adapter. */
export abstract class ViewerResolver {
	/** null without a session, or with an expired, revoked or forged one. */
	abstract resolve(headers: RequestHeaders): Promise<Viewer | null>;
}
