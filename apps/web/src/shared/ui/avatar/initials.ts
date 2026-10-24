/** Up to two initials, e.g. "Ada Lovelace" → "AL"; whole characters, so an emoji is not split. */
export function initialsOf(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => [...word][0]?.toLocaleUpperCase() ?? "")
		.join("");
}
