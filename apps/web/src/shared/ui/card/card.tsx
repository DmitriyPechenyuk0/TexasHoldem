import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";

/** A raised panel on the background, e.g. the box of a sign-in or settings page. */
export function Card({ className, ...props }: ComponentProps<"section">) {
	return (
		<section
			className={cn(
				"flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm",
				className,
			)}
			{...props}
		/>
	);
}

export function CardTitle({ className, ...props }: ComponentProps<"h1">) {
	return (
		<h1
			className={cn("text-xl font-semibold tracking-tight", className)}
			{...props}
		/>
	);
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
	return (
		<p className={cn("text-sm text-muted-foreground", className)} {...props} />
	);
}
