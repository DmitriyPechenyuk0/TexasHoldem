import { notFound } from "next/navigation";

/** Catches every path under a locale that no route matches, so its 404 is localized too. */
export function UnmatchedPage(): never {
	notFound();
}
