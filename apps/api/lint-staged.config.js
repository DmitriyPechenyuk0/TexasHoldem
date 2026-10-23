import base from "../../lint-staged.config.js";

const config = {
	...base,
	"{src,test}/**/*.ts": "oxlint --type-aware --fix",
};

export default config;
