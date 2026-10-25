/** PostgreSQL's SQLSTATE for a broken unique constraint. */
const UNIQUE_VIOLATION = "23505";

/** Whether a failed query broke a unique constraint; drizzle wraps the driver's error in `cause`. */
export function isUniqueViolation(error: unknown): boolean {
	for (let current = error; current instanceof Error; current = current.cause) {
		if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) {
			return true;
		}
	}
	return false;
}
