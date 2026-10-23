import base from "../../lint-staged.config.js";

// Dependency rules look at the whole graph: a change in one file can create a cycle or a violation elsewhere.
const checkDependencies = () => "depcruise src test --output-type err-long";

const config = {
	...base,
	"{src,test}/**/*.ts": ["oxlint --type-aware --fix", checkDependencies],
	".dependency-cruiser.ts": checkDependencies,
};

export default config;
