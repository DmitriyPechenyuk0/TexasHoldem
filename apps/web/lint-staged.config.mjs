import base from "../../lint-staged.config.js";

// FSD rules look at the whole tree: a new or moved file can break an import elsewhere.
const checkFsd = () => "steiger ./src";

const config = {
	...base,
	"*.{js,jsx,mjs,cjs,ts,tsx}": "eslint --fix --max-warnings=0",
	"src/**": checkFsd,
	"steiger.config.mjs": checkFsd,
	// A catalog is only in sync relative to the others, so the check reads them all.
	"{src/shared/i18n/messages/**/*.json,scripts/check-messages.mjs}": () =>
		"node scripts/check-messages.mjs",
};

export default config;
