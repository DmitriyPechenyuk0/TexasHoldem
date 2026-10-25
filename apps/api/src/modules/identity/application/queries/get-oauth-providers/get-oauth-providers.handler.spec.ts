import { OAuthProviders } from "../../oauth-providers.js";
import { GetOAuthProvidersHandler } from "./get-oauth-providers.handler.js";

class FixedProviders extends OAuthProviders {
	enabled() {
		return ["github", "discord"] as const;
	}
}

describe("GetOAuthProvidersHandler", () => {
	it("lists the providers with keys", async () => {
		expect(
			await new GetOAuthProvidersHandler(new FixedProviders()).execute(),
		).toEqual({
			providers: ["github", "discord"],
		});
	});
});
