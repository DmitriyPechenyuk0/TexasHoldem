import type { UserConfig } from "@commitlint/types";

// Workspace packages and areas, then bounded contexts from the Context Map.
const scopes = [
	"engine",
	"api",
	"web",
	"shared",
	"infra",
	"deps",
	"gameplay",
	"table",
	"lobby",
	"identity",
	"profile",
	"social",
	"chat",
	"history",
	"moderation",
	"tournament",
	"bots",
];

const config: UserConfig = {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-enum": [2, "always", scopes],
	},
	helpUrl:
		"https://github.com/DmitriyPechenyuk0/TexasHoldem#commit-conventions",
};

export default config;
