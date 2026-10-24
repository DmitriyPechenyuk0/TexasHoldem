"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";
import { useFormField } from "../form-field/form-field";

export interface InputProps extends ComponentProps<"input"> {
	/** Inside a FormField this comes from its error. */
	readonly invalid?: boolean;
}

export function Input({
	id,
	invalid,
	className,
	"aria-describedby": describedBy,
	...props
}: InputProps) {
	const field = useFormField();
	const descriptions =
		[field?.describedBy, describedBy].filter(Boolean).join(" ") || undefined;

	return (
		<input
			id={id ?? field?.id}
			aria-invalid={(invalid ?? field?.invalid) ? true : undefined}
			aria-describedby={descriptions}
			className={cn(
				"focus-ring h-10 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-sm text-foreground transition-colors duration-fast placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
				className,
			)}
			{...props}
		/>
	);
}
