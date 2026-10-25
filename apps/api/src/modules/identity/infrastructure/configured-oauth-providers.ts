import {
	OAUTH_PROVIDERS,
	type OAuthProvider,
} from "@holdem/shared/contracts/identity";
import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/shared/infrastructure/config/index.js";
import { OAuthProviders } from "../application/oauth-providers.js";

/** A provider is enabled when both its client id and secret are set (`.env.example`). */
export const enabledOAuthProviders = (config: AppConfig): OAuthProvider[] =>
	OAUTH_PROVIDERS.filter((provider) => config.auth.oauth[provider]);

@Injectable()
export class ConfiguredOAuthProviders extends OAuthProviders {
	private readonly providers: readonly OAuthProvider[];

	constructor(config: AppConfig) {
		super();
		this.providers = enabledOAuthProviders(config);
	}

	enabled(): readonly OAuthProvider[] {
		return this.providers;
	}
}
