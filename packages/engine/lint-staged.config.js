import base from "../../lint-staged.config.js";

const config = {
	...base,
	"*.ts": "oxlint --type-aware --deny-warnings --fix",
};

export default config;
