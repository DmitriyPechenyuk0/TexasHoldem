import type { OAuthProvidersResponse } from "@holdem/shared/contracts/identity";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { OAuthProviders } from "../../oauth-providers.js";
import { GetOAuthProvidersQuery } from "./get-oauth-providers.query.js";

@QueryHandler(GetOAuthProvidersQuery)
export class GetOAuthProvidersHandler implements IQueryHandler<GetOAuthProvidersQuery> {
	constructor(private readonly providers: OAuthProviders) {}

	async execute(): Promise<OAuthProvidersResponse> {
		return { providers: [...this.providers.enabled()] };
	}
}
