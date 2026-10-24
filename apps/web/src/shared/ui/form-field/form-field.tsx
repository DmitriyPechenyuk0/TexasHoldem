"use client";

import { createContext, type ReactNode, useContext, useId } from "react";
import { cn } from "@/shared/lib";
import { Label } from "../label/label";

interface FormFieldState {
	readonly id: string;
	readonly describedBy: string | undefined;
	readonly invalid: boolean;
}

const FormFieldContext = createContext<FormFieldState | null>(null);

/** The id, description and validity a control inside a FormField takes on. */
export function useFormField(): FormFieldState | null {
	return useContext(FormFieldContext);
}

export interface FormFieldProps {
	readonly label: ReactNode;
	/** Shown under the control and read with it. */
	readonly hint?: ReactNode;
	/** Marks the control invalid and is read with it. */
	readonly error?: ReactNode;
	/** One control: Input, PasswordInput or another that reads `useFormField`. */
	readonly children: ReactNode;
	readonly className?: string;
}

/** A label, a control and its hint or error, wired together for assistive technology. */
export function FormField({
	label,
	hint,
	error,
	children,
	className,
}: FormFieldProps) {
	const id = useId();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;
	const describedBy =
		[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
		undefined;

	return (
		<FormFieldContext value={{ id, describedBy, invalid: Boolean(error) }}>
			<div className={cn("flex flex-col gap-1.5", className)}>
				<Label htmlFor={id}>{label}</Label>
				{children}
				{hint && (
					<p id={hintId} className="text-xs text-muted-foreground">
						{hint}
					</p>
				)}
				<p
					id={errorId}
					aria-live="polite"
					className="text-xs text-danger-text empty:hidden"
				>
					{error}
				</p>
			</div>
		</FormFieldContext>
	);
}
