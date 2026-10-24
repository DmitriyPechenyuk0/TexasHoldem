"use client";

import { Slider as RadixSlider } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";

type RootProps = ComponentProps<typeof RadixSlider.Root>;

export interface SliderProps extends Omit<
	RootProps,
	"value" | "defaultValue" | "onValueChange" | "onValueCommit"
> {
	/** The thumb's accessible name, e.g. "Bet amount". */
	readonly label: string;
	readonly value?: number;
	readonly defaultValue?: number;
	readonly onValueChange?: (value: number) => void;
	/** Once the drag or key press ends. */
	readonly onValueCommit?: (value: number) => void;
}

/** One thumb. Arrow keys step, Page Up/Down step by ten, Home/End jump to the ends. */
export function Slider({
	label,
	value,
	defaultValue,
	onValueChange,
	onValueCommit,
	min = 0,
	className,
	...props
}: SliderProps) {
	return (
		<RadixSlider.Root
			value={value === undefined ? undefined : [value]}
			defaultValue={defaultValue === undefined ? undefined : [defaultValue]}
			onValueChange={(values) => onValueChange?.(values[0] ?? min)}
			onValueCommit={(values) => onValueCommit?.(values[0] ?? min)}
			min={min}
			className={cn(
				"relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-muted">
				<RadixSlider.Range className="absolute h-full bg-primary" />
			</RadixSlider.Track>
			<RadixSlider.Thumb
				aria-label={label}
				className="focus-ring block size-5 cursor-grab rounded-full border-2 border-primary bg-surface shadow transition-colors duration-fast hover:bg-surface-muted active:cursor-grabbing"
			/>
		</RadixSlider.Root>
	);
}
