"use client";

import { Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";

/** Arrow keys move between tabs; Tab moves into the active panel. */
export const Tabs = RadixTabs.Root;

export function TabsList({
	className,
	...props
}: ComponentProps<typeof RadixTabs.List>) {
	return (
		<RadixTabs.List
			className={cn(
				"inline-flex items-center gap-1 rounded-md bg-surface-muted p-1",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsTrigger({
	className,
	...props
}: ComponentProps<typeof RadixTabs.Trigger>) {
	return (
		<RadixTabs.Trigger
			className={cn(
				"focus-ring cursor-pointer rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsContent({
	className,
	...props
}: ComponentProps<typeof RadixTabs.Content>) {
	return (
		<RadixTabs.Content
			className={cn("focus-ring mt-3 rounded-md", className)}
			{...props}
		/>
	);
}
