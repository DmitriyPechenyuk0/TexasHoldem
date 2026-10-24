import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib";
import {
	buttonBase,
	type ButtonSize,
	type ButtonVariant,
	buttonVariants,
} from "../button/button-styles";
import { Tooltip } from "../tooltip/tooltip";

const sizes: Record<ButtonSize, string> = {
	sm: "size-8 [&_svg]:size-4",
	md: "size-10 [&_svg]:size-5",
	lg: "size-12 [&_svg]:size-6",
};

export interface IconButtonProps extends Omit<
	ComponentProps<"button">,
	"aria-label" | "children"
> {
	/** The accessible name, also shown as a tooltip: an icon alone tells nothing to a screen reader. */
	readonly label: string;
	/** The icon. */
	readonly children: ReactNode;
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
	/** Off where a tooltip would only get in the way, e.g. a dialog's close button. */
	readonly tooltip?: boolean;
}

export function IconButton({
	label,
	children,
	variant = "ghost",
	size = "md",
	tooltip = true,
	type = "button",
	className,
	...props
}: IconButtonProps) {
	const button = (
		<button
			type={type}
			aria-label={label}
			className={cn(
				buttonBase,
				buttonVariants[variant],
				sizes[size],
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
	return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
