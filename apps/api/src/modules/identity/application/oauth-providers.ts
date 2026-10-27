import type { OAuthProvider } from "@holdem/shared/contracts/identity";

/** Port: the OAuth providers this deployment has keys for. */
export abstract class OAuthProviders {
	abstract enabled(): readonly OAuthProvider[];
}
