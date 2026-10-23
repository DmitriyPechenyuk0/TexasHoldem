import type { IConfiguration } from "dependency-cruiser";

// Layer rules from ARCHITECTURE.md. Paths are relative to apps/api.
// A "unit" is a context module or the shared kernel; both are split into the same four layers.
const UNIT = "src/(?:modules/[^/]+|shared)";

// `@holdem/engine` resolves to packages/engine/dist, or stays unresolved until the package is built.
const ENGINE = "(?:^|/)packages/engine/|^@holdem/engine(?:/|$)";

// Libraries that only adapters may use, matched installed (…/node_modules/<name>/) or not yet installed (<name>).
const IO_LIBRARIES =
	"(?:^|/node_modules/)(?:drizzle-orm|pg|postgres|ioredis|redis|socket\\.io|@aws-sdk/[^/]+|nodemailer|better-auth)(?:/|$)";

const config: IConfiguration = {
	forbidden: [
		{
			name: "domain-is-pure",
			comment:
				"Domain code may only import its own domain, src/shared/domain and @holdem/engine: no NestJS, I/O libraries or Node built-ins.",
			severity: "error",
			from: { path: `^(${UNIT})/domain/` },
			to: { pathNot: ["^$1/domain/", "^src/shared/domain/", ENGINE] },
		},
		{
			name: "application-depends-on-ports",
			comment:
				"Command and event handlers reach adapters only through ports; infrastructure is bound in the module file.",
			severity: "error",
			from: {
				path: `^${UNIT}/application/`,
				pathNot: "/application/queries/",
			},
			to: { path: `^${UNIT}/(?:infrastructure|presentation)/` },
		},
		{
			name: "application-uses-no-io-libraries",
			comment:
				"Command and event handlers depend on ports, not on database, cache, socket, storage or mail libraries.",
			severity: "error",
			from: {
				path: `^${UNIT}/application/`,
				pathNot: "/application/queries/",
			},
			to: { path: IO_LIBRARIES },
		},
		{
			name: "queries-read-only-the-database",
			comment:
				"Query handlers may read through the shared database client (ADR-003), but use no other adapter.",
			severity: "error",
			from: { path: `^${UNIT}/application/queries/` },
			to: {
				path: `^${UNIT}/(?:infrastructure|presentation)/`,
				pathNot: "^src/shared/infrastructure/database/",
			},
		},
		{
			name: "presentation-goes-through-the-bus",
			comment:
				"Controllers and gateways send commands and queries; they do not touch adapters or a context's domain.",
			severity: "error",
			from: { path: `^${UNIT}/presentation/` },
			to: {
				path: `^(?:${UNIT}/infrastructure/|src/modules/[^/]+/domain/)`,
			},
		},
		{
			name: "infrastructure-is-not-presentation",
			comment: "Adapters do not depend on controllers or gateways.",
			severity: "error",
			from: { path: `^${UNIT}/infrastructure/` },
			to: { path: `^${UNIT}/presentation/` },
		},
		{
			name: "module-public-api",
			comment:
				"Another module is reachable only through its index.ts (application-level API or integration events).",
			severity: "error",
			from: { path: "^src/modules/([^/]+)/" },
			to: {
				path: "^src/modules/",
				pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
			},
		},
		{
			name: "shared-knows-no-module",
			comment: "The shared kernel sits below every context module.",
			severity: "error",
			from: { path: "^src/shared/" },
			to: { path: "^src/modules/" },
		},
		{
			name: "composition-root-is-a-leaf",
			comment:
				"Only main.ts and tests import the composition root; modules never reach back into it.",
			severity: "error",
			from: { path: "^src/(?:modules|shared)/" },
			to: { path: "^src/(?:main|app\\.module)\\.ts$" },
		},
		{
			name: "no-circular",
			comment: "Cycles hide layering mistakes and break module initialisation.",
			severity: "error",
			from: {},
			to: { circular: true },
		},
		{
			name: "production-code-uses-no-dev-dependencies",
			comment:
				"Production code does not import dev dependencies, which are absent from a production install.",
			severity: "error",
			from: { path: "^src/", pathNot: "\\.spec\\.ts$" },
			to: {
				dependencyTypes: ["npm-dev"],
			},
		},
		{
			name: "production-code-imports-no-tests",
			comment: "Production code does not import specs or test support.",
			severity: "error",
			from: { path: "^src/", pathNot: "\\.spec\\.ts$" },
			to: { path: "(?:^test/|\\.spec\\.ts$)" },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		// Type-only imports are dependencies too: `import type { X } from "@nestjs/common"` in domain still couples it.
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.json" },
	},
};

export default config;
