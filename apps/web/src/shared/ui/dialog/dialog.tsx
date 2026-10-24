"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as RadixDialog } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib";
import { IconButton } from "../icon-button/icon-button";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/** A modal: traps focus, closes on Escape and outside clicks, returns focus to its trigger. */
export function DialogContent({
	className,
	children,
	...props
}: ComponentProps<typeof RadixDialog.Content>) {
	const t = useTranslations("common.ui");

	return (
		<RadixDialog.Portal>
			<RadixDialog.Overlay className="fixed inset-0 z-overlay bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
			<RadixDialog.Content
				className={cn(
					"fixed top-1/2 left-1/2 z-modal flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-foreground shadow-xl outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
					className,
				)}
				{...props}
			>
				{children}
				<RadixDialog.Close asChild>
					<IconButton
						label={t("close")}
						size="sm"
						tooltip={false}
						className="absolute top-3 right-3"
					>
						<X />
					</IconButton>
				</RadixDialog.Close>
			</RadixDialog.Content>
		</RadixDialog.Portal>
	);
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />
	);
}

/** Required: screen readers announce it when the dialog opens. */
export function DialogTitle({
	className,
	...props
}: ComponentProps<typeof RadixDialog.Title>) {
	return (
		<RadixDialog.Title
			className={cn("text-lg font-semibold", className)}
			{...props}
		/>
	);
}

export function DialogDescription({
	className,
	...props
}: ComponentProps<typeof RadixDialog.Description>) {
	return (
		<RadixDialog.Description
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}
