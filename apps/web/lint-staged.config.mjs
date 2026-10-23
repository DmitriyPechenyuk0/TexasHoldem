import base from "../../lint-staged.config.js";

const config = {
	...base,
	"*.{js,jsx,mjs,cjs,ts,tsx}": "eslint --fix --max-warnings=0",
};

export default config;
