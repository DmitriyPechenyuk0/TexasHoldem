/** What a secret-bearing key looks like, in any case: `password`, `newPassword`, `Authorization`, `set-cookie`… */
const SECRET_KEY =
	/passw(or)?d|pwd|token|secret|authorization|cookie|api[-_]?key|credential/i;

/** Replaces every secret value logged by hand. */
export const REDACTED = "[redacted]";

/**
 * A copy of a logged object with the value of every secret-looking key replaced, at any depth.
 * Requests themselves never log headers or query strings; this is defense in depth for objects
 * logged by hand. Errors are left whole for their serializer, and a cycle is cut, not followed.
 */
export function redactSecrets(
	value: unknown,
	seen = new WeakSet<object>(),
): unknown {
	if (
		value === null ||
		typeof value !== "object" ||
		value instanceof Error ||
		seen.has(value)
	) {
		return value;
	}
	seen.add(value);
	if (Array.isArray(value)) {
		return value.map((item) => redactSecrets(item, seen));
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, inner]) => [
			key,
			SECRET_KEY.test(key) ? REDACTED : redactSecrets(inner, seen),
		]),
	);
}
