"use client";

import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib";

/** Mounted once in the root layout; tooltips opened in a row skip the delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
	return (
		<RadixTooltip.Provider delayDuration={400}>
			{children}
		</RadixTooltip.Provider>
	);
}

export interface TooltipProps {
	readonly content: ReactNode;
	/** The trigger: one element that takes a ref, such as a button. */
	readonly children: ReactNode;
	readonly side?: "top" | "right" | "bottom" | "left";
	readonly className?: string;
}

/** A short hint on hover and keyboard focus. Never the only place for essential information. */
export function Tooltip({
	content,
	children,
	side = "top",
	className,
}: TooltipProps) {
	return (
		<RadixTooltip.Root>
			<RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
			<RadixTooltip.Portal>
				<RadixTooltip.Content
					side={side}
					sideOffset={6}
					className={cn(
						"z-tooltip max-w-xs rounded-sm bg-foreground px-2 py-1 text-xs text-background shadow-md data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in",
						className,
					)}
				>
					{content}
				</RadixTooltip.Content>
			</RadixTooltip.Portal>
		</RadixTooltip.Root>
	);
}
