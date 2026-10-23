// Not the `@/shared/config` barrel: importing it would validate the public env before `register` runs.
import { EnvError } from "@/shared/config/validate-env";

// Runs once when a server instance starts, before it handles requests.
// Both modules are loaded even if one fails, so every problem is reported at once.
export async function register() {
	const results = await Promise.allSettled([
		import("@/shared/config/public-env"),
		import("@/shared/config/server-env"),
	]);
	const failures = results.flatMap((result) =>
		result.status === "rejected" ? [result.reason] : [],
	);
	if (failures.length === 0) {
		return;
	}
	if (!failures.every((failure) => failure instanceof EnvError)) {
		throw failures[0];
	}

	const error = new EnvError(
		failures.flatMap((failure) => failure.problems).sort(),
	);
	// `next start` only logs a failed `register` and keeps answering every request with 500,
	// so the Node.js server exits instead. The Edge runtime has no `process.exit`.
	// eslint-disable-next-line no-restricted-properties -- runtime flag set by Next.js, not configuration
	if (process.env.NEXT_RUNTIME === "nodejs") {
		console.error(error.message);
		process.exit(1);
	}
	throw error;
}
