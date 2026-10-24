import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib";

export type SpinnerSize = "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
	sm: "size-4",
	md: "size-6",
	lg: "size-10",
};

export interface SpinnerProps {
	readonly size?: SpinnerSize;
	/** Inside a control that already says it is busy (e.g. a loading Button): hidden from screen readers. */
	readonly decorative?: boolean;
	readonly className?: string;
}

export function Spinner({
	size = "md",
	decorative = false,
	className,
}: SpinnerProps) {
	const t = useTranslations("common.ui");
	const svg = (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden
			// Keeps spinning under reduced motion: a frozen spinner reads as a broken icon.
			data-motion="essential"
			className={cn("animate-spin", sizes[size], className)}
		>
			<circle
				cx="12"
				cy="12"
				r="9"
				stroke="currentColor"
				strokeOpacity="0.25"
				strokeWidth="3"
			/>
			<path
				d="M21 12a9 9 0 0 0-9-9"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
			/>
		</svg>
	);
	if (decorative) {
		return svg;
	}
	return (
		<span role="status" className="inline-flex">
			{svg}
			<span className="sr-only">{t("loading")}</span>
		</span>
	);
}
