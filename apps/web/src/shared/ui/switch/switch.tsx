"use client";

import { Switch as RadixSwitch } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";

/** An on/off control; name it with a Label (`htmlFor`) or `aria-label`. Space toggles it. */
export function Switch({
	className,
	...props
}: ComponentProps<typeof RadixSwitch.Root>) {
	return (
		<RadixSwitch.Root
			className={cn(
				"focus-ring peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
				className,
			)}
			{...props}
		>
			<RadixSwitch.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow transition-transform duration-fast data-[state=checked]:translate-x-5" />
		</RadixSwitch.Root>
	);
}
