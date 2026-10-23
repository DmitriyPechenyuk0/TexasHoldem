import path from "node:path";

// lint-staged uses only the closest config for each staged file, so package configs spread this one.
// Tasks run in the config's directory, and Prettier reads ignore files from its cwd, so they are passed explicitly.
const root = import.meta.dirname;
const ignorePaths = [".gitignore", ".prettierignore"]
	.map((file) => `--ignore-path "${path.join(root, file)}"`)
	.join(" ");

const config = {
	"*": `prettier --write --ignore-unknown ${ignorePaths}`,
};

export default config;
