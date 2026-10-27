import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cruise, type ICruiseResult } from "dependency-cruiser";
import config from "../../.dependency-cruiser.js";

type FileTree = Readonly<Record<string, string>>;

/** `../../node_modules/.pnpm/…/node_modules/@nestjs/common/index.js` → `@nestjs/common`. */
const packageName = (resolved: string): string =>
	resolved.replace(/^.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\/.*$/, "$1");

// Inside apps/api, so fixtures resolve real packages such as @nestjs/common and @holdem/engine.
const FIXTURES = fileURLToPath(
	new URL("../../node_modules/.cache/dependency-rules/", import.meta.url),
);

/** Cruises a throwaway `src/` tree with the real rules and lists `rule: from -> to`. */
async function violationsIn(files: FileTree): Promise<string[]> {
	await mkdir(FIXTURES, { recursive: true });
	const baseDir = await mkdtemp(path.join(FIXTURES, "case-"));
	try {
		for (const [file, content] of Object.entries(files)) {
			await mkdir(path.dirname(path.join(baseDir, file)), { recursive: true });
			await writeFile(path.join(baseDir, file), content);
		}
		// The fixtures use relative imports only, so they need no tsconfig.
		const { tsConfig: _tsConfig, ...options } = config.options ?? {};
		const { output } = await cruise(["src"], {
			...options,
			baseDir,
			ruleSet: { forbidden: config.forbidden },
			validate: true,
		});
		return (output as ICruiseResult).summary.violations
			.map(
				(violation) =>
					`${violation.rule.name}: ${violation.from} -> ${packageName(violation.to)}`,
			)
			.sort();
	} finally {
		await rm(baseDir, { recursive: true, force: true });
	}
}

const exportsValue = (name: string) => `export const ${name} = 1;\n`;

describe("dependency rules", () => {
	it("allow every dependency the architecture permits", async () => {
		expect(
			await violationsIn({
				"src/shared/domain/domain-error.ts": exportsValue("DomainError"),
				"src/shared/application/clock.ts": exportsValue("Clock"),
				"src/shared/infrastructure/database/client.ts": exportsValue("db"),
				"src/modules/table/domain/seat.ts":
					'import { DomainError } from "../../../shared/domain/domain-error.js";\n' +
					'import "@holdem/engine";\n' +
					"export const seat = DomainError;\n",
				"src/modules/table/domain/table.ts":
					'import { seat } from "./seat.js";\nexport const table = seat;\n',
				"src/modules/table/application/commands/take-seat.handler.ts":
					'import { table } from "../../domain/table.js";\n' +
					'import { Clock } from "../../../../shared/application/clock.js";\n' +
					'import { Injectable } from "@nestjs/common";\n' +
					"export const handler = [table, Clock, Injectable];\n",
				"src/modules/table/infrastructure/persistence/schema.ts":
					exportsValue("tables"),
				"src/modules/table/application/queries/get-table.handler.ts":
					'import { db } from "../../../../shared/infrastructure/database/client.js";\n' +
					'import { tables } from "../../infrastructure/persistence/schema.js";\n' +
					"export const query = [db, tables];\n",
				"src/modules/table/infrastructure/table.repository.ts":
					'import { table } from "../domain/table.js";\n' +
					'import { handler } from "../application/commands/take-seat.handler.js";\n' +
					"export const repository = [table, handler];\n",
				"src/modules/table/presentation/table.controller.ts":
					'import { handler } from "../application/commands/take-seat.handler.js";\n' +
					'import { DomainError } from "../../../shared/domain/domain-error.js";\n' +
					"export const controller = [handler, DomainError];\n",
				"src/modules/table/index.ts":
					'export { handler } from "./application/commands/take-seat.handler.js";\n',
				"src/modules/lobby/application/commands/open.handler.ts":
					'import { handler } from "../../../table/index.js";\nexport const open = handler;\n',
			}),
		).toEqual([]);
	});

	it.each<[string, FileTree, string]>([
		[
			"a NestJS import in domain",
			{
				"src/modules/table/domain/seat.ts":
					'import { Injectable } from "@nestjs/common";\nexport const seat = Injectable;\n',
			},
			"domain-is-pure: src/modules/table/domain/seat.ts -> @nestjs/common",
		],
		[
			"a type-only import in domain",
			{
				"src/modules/table/domain/seat.ts":
					'import type { Type } from "@nestjs/common";\nexport type Seat = Type;\n',
			},
			"domain-is-pure: src/modules/table/domain/seat.ts -> @nestjs/common",
		],
		[
			"a Node built-in in domain",
			{
				"src/modules/table/domain/seat.ts":
					'import { randomInt } from "node:crypto";\nexport const seat = randomInt;\n',
			},
			"domain-is-pure: src/modules/table/domain/seat.ts -> crypto",
		],
		[
			"domain reaching into application",
			{
				"src/modules/table/application/clock.ts": exportsValue("clock"),
				"src/modules/table/domain/seat.ts":
					'import { clock } from "../application/clock.js";\nexport const seat = clock;\n',
			},
			"domain-is-pure: src/modules/table/domain/seat.ts -> src/modules/table/application/clock.ts",
		],
		[
			"a command handler using an adapter",
			{
				"src/modules/table/infrastructure/table.repository.ts":
					exportsValue("repository"),
				"src/modules/table/application/commands/take-seat.handler.ts":
					'import { repository } from "../../infrastructure/table.repository.js";\n' +
					"export const handler = repository;\n",
			},
			"application-depends-on-ports: src/modules/table/application/commands/take-seat.handler.ts -> src/modules/table/infrastructure/table.repository.ts",
		],
		[
			"a command handler using an I/O library",
			{
				"src/modules/table/application/commands/take-seat.handler.ts":
					'import { eq } from "drizzle-orm";\nexport const handler = eq;\n',
			},
			"application-uses-no-io-libraries: src/modules/table/application/commands/take-seat.handler.ts -> drizzle-orm",
		],
		[
			"a command handler using the Redis client",
			{
				"src/modules/table/application/commands/take-seat.handler.ts":
					'import { createClient } from "@redis/client";\nexport const handler = createClient;\n',
			},
			"application-uses-no-io-libraries: src/modules/table/application/commands/take-seat.handler.ts -> @redis/client",
		],
		[
			"a command handler using the logging backend",
			{
				"src/modules/table/application/commands/take-seat.handler.ts":
					'import { PinoLogger } from "nestjs-pino";\nexport const handler = PinoLogger;\n',
			},
			"application-uses-no-io-libraries: src/modules/table/application/commands/take-seat.handler.ts -> nestjs-pino",
		],
		[
			"a query handler using a repository",
			{
				"src/modules/table/infrastructure/table.repository.ts":
					exportsValue("repository"),
				"src/modules/table/application/queries/get-table.handler.ts":
					'import { repository } from "../../infrastructure/table.repository.js";\n' +
					"export const query = repository;\n",
			},
			"queries-read-only-the-database: src/modules/table/application/queries/get-table.handler.ts -> src/modules/table/infrastructure/table.repository.ts",
		],
		[
			"a controller using an adapter",
			{
				"src/modules/table/infrastructure/table.repository.ts":
					exportsValue("repository"),
				"src/modules/table/presentation/table.controller.ts":
					'import { repository } from "../infrastructure/table.repository.js";\n' +
					"export const controller = repository;\n",
			},
			"presentation-goes-through-the-bus: src/modules/table/presentation/table.controller.ts -> src/modules/table/infrastructure/table.repository.ts",
		],
		[
			"a controller using the domain",
			{
				"src/modules/table/domain/table.ts": exportsValue("table"),
				"src/modules/table/presentation/table.controller.ts":
					'import { table } from "../domain/table.js";\nexport const controller = table;\n',
			},
			"presentation-goes-through-the-bus: src/modules/table/presentation/table.controller.ts -> src/modules/table/domain/table.ts",
		],
		[
			"an adapter using a controller",
			{
				"src/modules/table/presentation/table.controller.ts":
					exportsValue("controller"),
				"src/modules/table/infrastructure/table.repository.ts":
					'import { controller } from "../presentation/table.controller.js";\n' +
					"export const repository = controller;\n",
			},
			"infrastructure-is-not-presentation: src/modules/table/infrastructure/table.repository.ts -> src/modules/table/presentation/table.controller.ts",
		],
		[
			"a deep import into another module",
			{
				"src/modules/table/application/commands/take-seat.command.ts":
					exportsValue("TakeSeatCommand"),
				"src/modules/lobby/application/commands/open.handler.ts":
					'import { TakeSeatCommand } from "../../../table/application/commands/take-seat.command.js";\n' +
					"export const open = TakeSeatCommand;\n",
			},
			"module-public-api: src/modules/lobby/application/commands/open.handler.ts -> src/modules/table/application/commands/take-seat.command.ts",
		],
		[
			"the shared kernel depending on a module",
			{
				"src/modules/table/index.ts": exportsValue("table"),
				"src/shared/application/clock.ts":
					'import { table } from "../../modules/table/index.js";\nexport const clock = table;\n',
			},
			"shared-knows-no-module: src/shared/application/clock.ts -> src/modules/table/index.ts",
		],
		[
			"a module importing the composition root",
			{
				"src/app.module.ts": exportsValue("AppModule"),
				"src/modules/table/table.module.ts":
					'import { AppModule } from "../../app.module.js";\nexport const TableModule = AppModule;\n',
			},
			"composition-root-is-a-leaf: src/modules/table/table.module.ts -> src/app.module.ts",
		],
		[
			"production code importing test support",
			{
				"test/support/fake-clock.ts": exportsValue("fakeClock"),
				"src/shared/infrastructure/system-clock.ts":
					'import { fakeClock } from "../../../test/support/fake-clock.js";\n' +
					"export const clock = fakeClock;\n",
			},
			"production-code-imports-no-tests: src/shared/infrastructure/system-clock.ts -> test/support/fake-clock.ts",
		],
		[
			"production code importing a dev dependency",
			{
				"package.json": JSON.stringify({
					devDependencies: { "@nestjs/testing": "*" },
				}),
				"src/shared/infrastructure/testing.ts":
					'import { Test } from "@nestjs/testing";\nexport const testing = Test;\n',
			},
			"production-code-uses-no-dev-dependencies: src/shared/infrastructure/testing.ts -> @nestjs/testing",
		],
	])("reject %s", async (_case, files, expected) => {
		expect(await violationsIn(files)).toEqual([expected]);
	});

	it("allow type-only imports of dev dependencies, which the build erases", async () => {
		expect(
			await violationsIn({
				"package.json": JSON.stringify({
					devDependencies: { "@nestjs/testing": "*" },
				}),
				"src/shared/infrastructure/testing.ts":
					'import type { TestingModule } from "@nestjs/testing";\nexport type Testing = TestingModule;\n',
			}),
		).toEqual([]);
	});

	it("reject dependency cycles", async () => {
		expect(
			await violationsIn({
				"src/modules/table/domain/a.ts":
					'import { b } from "./b.js";\nexport const a = () => b;\n',
				"src/modules/table/domain/b.ts":
					'import { a } from "./a.js";\nexport const b = () => a;\n',
			}),
		).toEqual([
			"no-circular: src/modules/table/domain/a.ts -> src/modules/table/domain/b.ts",
		]);
	});
});
