"use client";

import { Check, Circle } from "lucide-react";
import { DropdownMenu as RadixMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";

export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;
export const DropdownMenuRadioGroup = RadixMenu.RadioGroup;

/** Arrow keys move between items, typing jumps to one, Escape closes and refocuses the trigger. */
export function DropdownMenuContent({
	className,
	sideOffset = 6,
	...props
}: ComponentProps<typeof RadixMenu.Content>) {
	return (
		<RadixMenu.Portal>
			<RadixMenu.Content
				sideOffset={sideOffset}
				className={cn(
					"z-dropdown min-w-40 overflow-hidden rounded-md border border-border bg-surface p-1 text-foreground shadow-lg data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in",
					className,
				)}
				{...props}
			/>
		</RadixMenu.Portal>
	);
}

const item =
	"relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-surface-muted [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenuItem({
	className,
	variant = "default",
	...props
}: ComponentProps<typeof RadixMenu.Item> & {
	readonly variant?: "default" | "danger";
}) {
	return (
		<RadixMenu.Item
			className={cn(
				item,
				variant === "danger" && "text-danger-text",
				className,
			)}
			{...props}
		/>
	);
}

export function DropdownMenuCheckboxItem({
	className,
	children,
	...props
}: ComponentProps<typeof RadixMenu.CheckboxItem>) {
	return (
		<RadixMenu.CheckboxItem className={cn(item, "pl-8", className)} {...props}>
			<span className="absolute left-2 flex size-4 items-center justify-center">
				<RadixMenu.ItemIndicator>
					<Check />
				</RadixMenu.ItemIndicator>
			</span>
			{children}
		</RadixMenu.CheckboxItem>
	);
}

export function DropdownMenuRadioItem({
	className,
	children,
	...props
}: ComponentProps<typeof RadixMenu.RadioItem>) {
	return (
		<RadixMenu.RadioItem className={cn(item, "pl-8", className)} {...props}>
			<span className="absolute left-2 flex size-4 items-center justify-center">
				<RadixMenu.ItemIndicator>
					<Circle className="size-2! fill-current" />
				</RadixMenu.ItemIndicator>
			</span>
			{children}
		</RadixMenu.RadioItem>
	);
}

export function DropdownMenuLabel({
	className,
	...props
}: ComponentProps<typeof RadixMenu.Label>) {
	return (
		<RadixMenu.Label
			className={cn(
				"px-2 py-1.5 text-xs font-medium text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function DropdownMenuSeparator({
	className,
	...props
}: ComponentProps<typeof RadixMenu.Separator>) {
	return (
		<RadixMenu.Separator
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			{...props}
		/>
	);
}
