import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

/**
 * Decorators that hand a handler what the client sent, unchecked. Handlers take input only
 * through `@ValidBody`, `@ValidQuery`, `@ValidParam` and `@ValidPayload`, which parse it with the
 * shared zod contracts first (`shared/presentation/request-validation.ts`).
 */
const UNCHECKED =
	/@(?:Body|Query|Param|Headers|Req|Request|MessageBody|Payload)\(/;

async function productionFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true });
	return entries
		.filter(
			(entry) =>
				entry.isFile() &&
				entry.name.endsWith(".ts") &&
				!entry.name.endsWith(".spec.ts"),
		)
		.map((entry) => path.join(entry.parentPath, entry.name));
}

describe("validated input", () => {
	it("reaches no controller or gateway without going through zod", async () => {
		const files = await productionFiles(SRC);
		const offending: string[] = [];
		for (const file of files) {
			const lines = (await readFile(file, "utf8")).split("\n");
			lines.forEach((line, index) => {
				if (UNCHECKED.test(line)) {
					offending.push(`${path.relative(SRC, file)}:${index + 1}`);
				}
			});
		}

		expect(files.length).toBeGreaterThan(100);
		expect(offending).toEqual([]);
	});
});
