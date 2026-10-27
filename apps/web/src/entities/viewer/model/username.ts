import { Username } from "@holdem/shared/contracts/identity";
import { ROUTES } from "@/shared/config";
import type { Viewer } from "../api/viewer";

export type UsernameError = "tooShort" | "tooLong" | "invalid";

/** What is wrong with a username by the api's rules; null when nothing. */
export function usernameError(value: string): UsernameError | null {
	const result = Username.safeParse(value);
	if (result.success) {
		return null;
	}
	switch (result.error.issues[0]?.code) {
		case "too_small":
			return "tooShort";
		case "too_big":
			return "tooLong";
		default:
			return "invalid";
	}
}

/**
 * Where a viewer goes from `path` (without the locale, with its query) while their account has
 * no username yet, which only an OAuth sign-in leaves: the username step, coming back after. Null
 * when they may stay.
 */
export function chooseUsernameRedirect(
	viewer: Viewer | null | undefined,
	path: string,
): { pathname: string; query: { next: string } } | null {
	if (!viewer || viewer.username !== null) {
		return null;
	}
	if (path.split("?")[0] === ROUTES.chooseUsername) {
		return null;
	}
	return { pathname: ROUTES.chooseUsername, query: { next: path } };
}
