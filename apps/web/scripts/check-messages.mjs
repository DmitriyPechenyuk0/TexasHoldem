// Checks the message catalogs in src/shared/i18n/messages/<locale>/<namespace>.json against the
// source locale: the same namespaces and keys, non-empty valid ICU texts and the same ICU arguments.
// TypeScript only sees keys missing from a locale; this also catches extra keys and argument drift.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const root = join(import.meta.dirname, "../src/shared/i18n/messages");
const source = "en";

const problems = [];

const readNamespaces = (locale) =>
	readdirSync(join(root, locale))
		.filter((file) => file.endsWith(".json"))
		.map((file) => file.slice(0, -".json".length));

/** The ICU arguments of a text, e.g. `count:plural`, `name:argument`, `link:tag`. */
function argumentsOf(elements, out = new Set()) {
	for (const element of elements) {
		if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
		out.add(`${element.value}:${TYPE[element.type]}`);
		if (element.type === TYPE.tag) argumentsOf(element.children, out);
		if (element.type === TYPE.select || element.type === TYPE.plural) {
			for (const option of Object.values(element.options)) {
				argumentsOf(option.value, out);
			}
		}
	}
	return out;
}

/** The ICU arguments of a text as a comparable string, or null if the text is unusable. */
function signatureOf(text, where, key) {
	if (typeof text !== "string") {
		problems.push(`${where}: "${key}" must be a text or a group of texts`);
		return null;
	}
	if (text.trim() === "") {
		problems.push(`${where}: "${key}" is empty`);
		return null;
	}
	try {
		return [...argumentsOf(parse(text))].sort().join(", ");
	} catch (error) {
		problems.push(
			`${where}: "${key}" is not a valid ICU message (${error.message})`,
		);
		return null;
	}
}

/** Flattens a catalog to `key.path → signature`. */
function flatten(node, where, path = "", out = new Map()) {
	for (const [key, value] of Object.entries(node)) {
		const keyPath = path ? `${path}.${key}` : key;
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			flatten(value, where, keyPath, out);
		} else {
			out.set(keyPath, signatureOf(value, where, keyPath));
		}
	}
	return out;
}

/** A namespace's keys and their signatures, or null if the file is not valid JSON. */
function load(locale, namespace) {
	const where = `${locale}/${namespace}.json`;
	try {
		return flatten(JSON.parse(readFileSync(join(root, where), "utf8")), where);
	} catch (error) {
		problems.push(`${where}: ${error.message}`);
		return null;
	}
}

/** locale → namespace → key → signature */
const catalogs = new Map(
	readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map(({ name: locale }) => [
			locale,
			new Map(
				readNamespaces(locale).map((namespace) => [
					namespace,
					load(locale, namespace),
				]),
			),
		]),
);

const expected = catalogs.get(source) ?? new Map();
if (expected.size === 0) problems.push(`${source}: no catalogs`);

for (const [locale, namespaces] of catalogs) {
	if (locale === source) continue;
	for (const namespace of namespaces.keys()) {
		if (!expected.has(namespace)) {
			problems.push(
				`${locale}/${namespace}.json: no such namespace in ${source}`,
			);
		}
	}
	for (const [namespace, sourceKeys] of expected) {
		const where = `${locale}/${namespace}.json`;
		if (!namespaces.has(namespace)) {
			problems.push(`${where}: missing`);
			continue;
		}
		const keys = namespaces.get(namespace);
		if (!keys || !sourceKeys) continue;
		for (const [key, signature] of sourceKeys) {
			if (!keys.has(key)) {
				problems.push(`${where}: "${key}" is missing`);
			} else if (
				signature !== null &&
				keys.get(key) !== null &&
				keys.get(key) !== signature
			) {
				problems.push(
					`${where}: "${key}" has arguments {${keys.get(key)}}, ${source} has {${signature}}`,
				);
			}
		}
		for (const key of keys.keys()) {
			if (!sourceKeys.has(key))
				problems.push(`${where}: "${key}" is not in ${source}`);
		}
	}
}

if (problems.length > 0) {
	console.error(
		`Message catalogs are out of sync:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
	);
	process.exit(1);
}
console.log(
	`Message catalogs are in sync: ${[...catalogs.keys()].join(", ")}.`,
);
