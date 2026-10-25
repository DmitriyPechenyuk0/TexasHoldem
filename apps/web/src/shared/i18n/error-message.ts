import { useTranslations } from "next-intl";

/**
 * Turns a thrown error into text for the user: an `ApiError`, `NetworkError` or
 * `RequestTimeoutError` by its `code` from the `errors` catalog, anything else as a generic
 * message. The server's own English `detail` is never shown.
 */
export function useErrorMessage(): (error: unknown) => string {
	const t = useTranslations("errors");
	return (error) => {
		const code =
			error instanceof Error &&
			"code" in error &&
			typeof error.code === "string"
				? error.code
				: undefined;
		// Codes are dotted paths into the catalog, e.g. `auth.invalid-token`.
		return code !== undefined && t.has(code as never)
			? t(code as never)
			: t("unknown");
	};
}
