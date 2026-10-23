import base from "../../lint-staged.config.js";

// FSD rules look at the whole tree: a new or moved file can break an import elsewhere.
const checkFsd = () => "steiger ./src";

const config = {
	...base,
	"*.{js,jsx,mjs,cjs,ts,tsx}": "eslint --fix --max-warnings=0",
	"src/**": checkFsd,
	"steiger.config.mjs": checkFsd,
};

export default config;
