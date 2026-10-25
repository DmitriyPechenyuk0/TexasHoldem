"use client";

import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/shared/i18n";
import { Button, type ButtonProps, toast } from "@/shared/ui";
import { useSignOut } from "../api/sign-out";

export function SignOutButton(props: Omit<ButtonProps, "onClick" | "loading">) {
	const t = useTranslations("auth.signOut");
	const errorMessage = useErrorMessage();
	const signOut = useSignOut();

	return (
		<Button
			variant="ghost"
			{...props}
			loading={signOut.isPending}
			onClick={() =>
				signOut.mutate(undefined, {
					onError: (error) =>
						toast({ variant: "error", title: errorMessage(error) }),
				})
			}
		>
			{t("action")}
		</Button>
	);
}
