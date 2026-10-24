import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";
import { Spinner } from "../spinner/spinner";
import {
	buttonBase,
	type ButtonSize,
	type ButtonVariant,
	buttonVariants,
} from "./button-styles";

const sizes: Record<ButtonSize, string> = {
	sm: "h-8 px-3 text-sm [&_svg]:size-4",
	md: "h-10 px-4 text-sm [&_svg]:size-4",
	lg: "h-12 px-6 text-base [&_svg]:size-5",
};

export interface ButtonProps extends ComponentProps<"button"> {
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
	/** Disables the button and shows a spinner; screen readers hear it as busy. */
	readonly loading?: boolean;
	/** Styles the only child instead, e.g. a link: `<Button asChild><Link href="/" /></Button>`. */
	readonly asChild?: boolean;
}

export function Button({
	variant = "primary",
	size = "md",
	loading = false,
	asChild = false,
	type = "button",
	disabled,
	className,
	children,
	...props
}: ButtonProps) {
	const classes = cn(
		buttonBase,
		buttonVariants[variant],
		sizes[size],
		className,
	);
	if (asChild) {
		return (
			<Slot.Root className={classes} {...props}>
				{children}
			</Slot.Root>
		);
	}
	return (
		<button
			type={type}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={classes}
			{...props}
		>
			{loading && <Spinner size="sm" decorative />}
			{children}
		</button>
	);
}
