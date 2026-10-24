"use client";

import { Label as RadixLabel } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";

export function Label({
	className,
	...props
}: ComponentProps<typeof RadixLabel.Root>) {
	return (
		<RadixLabel.Root
			className={cn(
				"text-sm font-medium text-foreground peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
