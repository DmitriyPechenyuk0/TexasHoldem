export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonBase =
	"focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-fast select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

export const buttonVariants: Record<ButtonVariant, string> = {
	primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
	secondary:
		"border border-input bg-surface text-foreground hover:bg-surface-muted",
	ghost: "text-foreground hover:bg-surface-muted",
	danger: "bg-danger text-danger-foreground hover:bg-danger-hover",
};
