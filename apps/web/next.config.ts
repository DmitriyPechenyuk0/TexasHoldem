import { readdirSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// English is the source catalog: next-intl turns each of its namespaces into a `.d.json.ts`
// declaration (on dev, build and typegen), so `t()` also type-checks ICU arguments.
const sourceMessages = "./src/shared/i18n/messages/en";

const withNextIntl = createNextIntlPlugin({
	requestConfig: "./src/shared/i18n/request.ts",
	experimental: {
		createMessagesDeclaration: readdirSync(sourceMessages)
			.filter((file) => file.endsWith(".json"))
			.map((file) => `${sourceMessages}/${file}`),
	},
});

const nextConfig: NextConfig = {
	cacheComponents: true,
	partialPrefetching: true,
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default withNextIntl(nextConfig);
