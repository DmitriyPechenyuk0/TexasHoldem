"use client";

import { Email } from "@holdem/shared/contracts/identity";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { getPathname, useErrorMessage } from "@/shared/i18n";
import { cn } from "@/shared/lib";
import { Button, FormField, Input } from "@/shared/ui";
import { resendVerificationEmail } from "../api/resend-verification";

export interface ResendVerificationProps {
	/** The address to send to; without it, the form asks for one. */
	readonly email?: string;
	/** Where the new link leads after verifying, a path on this site. */
	readonly next?: string | null;
	readonly className?: string;
}

/** Sends the verification link again, to a known address or one the visitor types in. */
export function ResendVerification({
	email,
	next,
	className,
}: ResendVerificationProps) {
	const t = useTranslations("auth.resend");
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const [typed, setTyped] = useState("");
	const [invalid, setInvalid] = useState(false);
	const resend = useMutation({
		mutationFn: (address: string) =>
			resendVerificationEmail(
				http,
				address,
				getPathname({
					href: { pathname: ROUTES.verifyEmail, query: next ? { next } : {} },
					locale,
				}),
			),
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const address = email ?? typed.trim();
		const valid = Email.safeParse(address).success;
		setInvalid(!valid);
		if (valid) {
			resend.mutate(address);
		}
	};

	if (resend.isSuccess) {
		return (
			<p role="status" className="text-sm text-muted-foreground">
				{t("sent", { email: resend.variables })}
			</p>
		);
	}

	return (
		<form
			onSubmit={submit}
			noValidate
			className={cn("flex w-full flex-col gap-3", className)}
		>
			{email === undefined && (
				<FormField
					label={t("emailLabel")}
					error={invalid ? t("emailInvalid") : undefined}
				>
					<Input
						type="email"
						autoComplete="email"
						value={typed}
						onChange={(event) => setTyped(event.target.value)}
					/>
				</FormField>
			)}
			<Button type="submit" variant="secondary" loading={resend.isPending}>
				{t("action")}
			</Button>
			{resend.isError && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(resend.error)}
				</p>
			)}
		</form>
	);
}
