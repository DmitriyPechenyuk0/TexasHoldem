import type { OAuthProvidersResponse } from "@holdem/shared/contracts/identity";
import { Query } from "@nestjs/cqrs";

export class GetOAuthProvidersQuery extends Query<OAuthProvidersResponse> {}
