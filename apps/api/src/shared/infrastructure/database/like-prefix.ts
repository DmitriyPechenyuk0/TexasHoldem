/** A LIKE pattern for values starting with `prefix`, whose wildcards match only themselves. */
export const startingWith = (prefix: string): string =>
	`${prefix.replace(/[\\%_]/g, "\\$&")}%`;
