"use client";

import { Email } from "@holdem/shared/contracts/identity";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { getPathname, Link, useErrorMessage } from "@/shared/i18n";
import {
	Button,
	CardDescription,
	CardTitle,
	FormField,
	Input,
} from "@/shared/ui";
import { requestPasswordReset } from "../api/request-password-reset";

export function ForgotPasswordForm() {
	const t = useTranslations("auth.forgotPassword");
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const [email, setEmail] = useState("");
	const [invalid, setInvalid] = useState(false);
	const request = useMutation({
		mutationFn: (address: string) =>
			requestPasswordReset(
				http,
				address,
				getPathname({ href: ROUTES.resetPassword, locale }),
			),
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const address = email.trim();
		const valid = Email.safeParse(address).success;
		setInvalid(!valid);
		if (valid) {
			request.mutate(address);
		}
	};

	if (request.isSuccess) {
		return (
			<>
				<CardTitle>{t("sent.title")}</CardTitle>
				<CardDescription role="status">
					{t("sent.description", { email: request.variables })}
				</CardDescription>
				<Link
					href={ROUTES.signIn}
					className="focus-ring self-start rounded-sm text-sm underline underline-offset-4"
				>
					{t("backToSignIn")}
				</Link>
			</>
		);
	}

	return (
		<>
			<CardTitle>{t("title")}</CardTitle>
			<CardDescription>{t("description")}</CardDescription>
			<form onSubmit={submit} noValidate className="flex flex-col gap-4">
				<FormField
					label={t("emailLabel")}
					error={invalid ? t("emailInvalid") : undefined}
				>
					<Input
						type="email"
						autoComplete="email"
						autoFocus
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</FormField>
				<Button type="submit" loading={request.isPending}>
					{t("action")}
				</Button>
				{request.isError && (
					<p role="alert" className="text-sm text-danger-text">
						{errorMessage(request.error)}
					</p>
				)}
			</form>
			<Link
				href={ROUTES.signIn}
				className="focus-ring self-start rounded-sm text-sm underline underline-offset-4"
			>
				{t("backToSignIn")}
			</Link>
		</>
	);
}
