"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Toast as RadixToast } from "radix-ui";
import { cn } from "@/shared/lib";
import { IconButton } from "../icon-button/icon-button";
import { type ToastVariant, useToasts } from "./toast-store";

const accents: Record<ToastVariant, string> = {
	info: "border-l-primary",
	success: "border-l-success",
	error: "border-l-danger",
};

/** Mounted once in the root layout. F8 moves focus to the toasts. */
export function Toaster() {
	const t = useTranslations("common.ui");
	const toasts = useToasts((state) => state.toasts);
	const dismiss = useToasts((state) => state.dismiss);

	return (
		<RadixToast.Provider swipeDirection="right" label={t("notification")}>
			{toasts.map(
				({ id, open, title, description, variant = "info", durationMs }) => (
					<RadixToast.Root
						key={id}
						open={open}
						onOpenChange={(isOpen) => {
							if (!isOpen) {
								dismiss(id);
							}
						}}
						duration={durationMs}
						// Errors interrupt the screen reader; the rest wait their turn.
						type={variant === "error" ? "foreground" : "background"}
						className={cn(
							"grid grid-cols-[1fr_auto] items-start gap-x-2 rounded-lg border border-l-4 border-border bg-surface py-3 pr-2 pl-4 text-foreground shadow-lg data-[state=closed]:animate-fade-out data-[state=open]:animate-slide-in data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[translate] data-[swipe=end]:animate-swipe-out data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
							accents[variant],
						)}
					>
						<div className="flex flex-col gap-1 py-1">
							<RadixToast.Title className="text-sm font-semibold">
								{title}
							</RadixToast.Title>
							{description && (
								<RadixToast.Description className="text-sm text-muted-foreground">
									{description}
								</RadixToast.Description>
							)}
						</div>
						<RadixToast.Close asChild>
							<IconButton label={t("close")} size="sm" tooltip={false}>
								<X />
							</IconButton>
						</RadixToast.Close>
					</RadixToast.Root>
				),
			)}
			<RadixToast.Viewport
				// Radix fills in `{hotkey}` itself.
				label={t("notifications", { hotkey: "{hotkey}" })}
				className="fixed right-0 bottom-0 z-toast focus-ring flex w-full max-w-sm flex-col gap-2 p-4"
			/>
		</RadixToast.Provider>
	);
}
