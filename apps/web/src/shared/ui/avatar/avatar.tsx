"use client";

import { Avatar as RadixAvatar } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib";
import { initialsOf } from "./initials";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const sizes: Record<AvatarSize, string> = {
	sm: "size-8 text-xs",
	md: "size-10 text-sm",
	lg: "size-16 text-xl",
	xl: "size-24 text-3xl",
};

export interface AvatarProps {
	/** The person's display name: the image's alt text and the source of the initials. */
	readonly name: string;
	readonly src?: string | null;
	readonly size?: AvatarSize;
	/** Drawn without a picture, while it loads and if it fails; the initials by default. */
	readonly fallback?: ReactNode;
	readonly className?: string;
}

/** The picture, or the fallback while it loads and if it fails. */
export function Avatar({
	name,
	src,
	size = "md",
	fallback,
	className,
}: AvatarProps) {
	return (
		<RadixAvatar.Root
			className={cn(
				"inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted align-middle font-medium text-muted-foreground select-none",
				sizes[size],
				className,
			)}
		>
			{src && (
				<RadixAvatar.Image
					src={src}
					alt={name}
					className="size-full object-cover"
				/>
			)}
			<RadixAvatar.Fallback
				role="img"
				aria-label={name}
				// A short delay, so a fast image does not flash the initials first.
				delayMs={src ? 300 : undefined}
			>
				{fallback ?? initialsOf(name)}
			</RadixAvatar.Fallback>
		</RadixAvatar.Root>
	);
}
