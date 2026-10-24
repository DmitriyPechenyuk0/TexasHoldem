import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names; a later Tailwind class wins over a conflicting earlier one (`px-2` vs `px-4`). */
export function cn(...classes: ClassValue[]): string {
	return twMerge(clsx(classes));
}
