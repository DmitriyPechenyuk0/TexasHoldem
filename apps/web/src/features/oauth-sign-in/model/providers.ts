import type { OAuthProvider } from "@holdem/shared/contracts/identity";

/** Brand names, the same in every language. */
export const PROVIDER_NAMES: Readonly<Record<OAuthProvider, string>> = {
	google: "Google",
	github: "GitHub",
	discord: "Discord",
};
