"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useState } from "react";
import { ResendVerification } from "@/features/resend-verification";
import { ApiError, http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { getPathname, type Locale, useErrorMessage } from "@/shared/i18n";
import {
	Button,
	CardDescription,
	CardTitle,
	FormField,
	Input,
	PasswordInput,
} from "@/shared/ui";
import { signUp } from "../api/sign-up";
import {
	hasErrors,
	type SignUpErrors,
	signUpErrors,
} from "../model/sign-up-errors";

/**
 * Username, email and password. Each field is checked by the api's rules before sending, and a
 * taken username comes back inline. Then the visitor waits for the emailed link.
 */
export function SignUpForm({
	next,
	children,
}: {
	readonly next: string | null;
	/** Shown under the form until it is sent: the providers' buttons and the way to sign in. */
	readonly children?: ReactNode;
}) {
	// One translator for both namespaces: the username's texts are shared with the username step.
	const t = useTranslations("auth");
	const errorMessage = useErrorMessage();
	const locale = useLocale() as Locale;
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errors, setErrors] = useState<SignUpErrors>({});
	const register = useMutation({
		mutationFn: () =>
			signUp(http, {
				username,
				email: email.trim(),
				password,
				locale,
				callbackURL: getPathname({
					href: {
						pathname: ROUTES.verifyEmail,
						query: next ? { next } : {},
					},
					locale,
				}),
			}),
		onError: (error) => {
			if (
				error instanceof ApiError &&
				error.code === "auth.username-is-already-taken"
			) {
				setErrors({ username: "taken" });
			}
		},
	});

	if (register.isSuccess) {
		return (
			<>
				<CardTitle>{t("signUp.sent.title")}</CardTitle>
				<CardDescription role="status">
					{t("signUp.sent.description", { email: email.trim() })}
				</CardDescription>
				<ResendVerification email={email.trim()} next={next} />
			</>
		);
	}

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const found = signUpErrors({ username, email: email.trim(), password });
		setErrors(found);
		if (!hasErrors(found)) {
			register.mutate();
		}
	};

	const usernameTaken =
		register.error instanceof ApiError &&
		register.error.code === "auth.username-is-already-taken";

	return (
		<>
			<CardTitle>{t("signUp.title")}</CardTitle>
			<CardDescription>{t("signUp.description")}</CardDescription>
			<form onSubmit={submit} noValidate className="flex flex-col gap-4">
				<FormField
					label={t("username.label")}
					hint={t("username.hint")}
					error={errors.username && t(`username.errors.${errors.username}`)}
				>
					<Input
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						autoFocus
						value={username}
						onChange={(event) => setUsername(event.target.value)}
					/>
				</FormField>
				<FormField
					label={t("signUp.emailLabel")}
					error={errors.email && t("signUp.emailInvalid")}
				>
					<Input
						type="email"
						autoComplete="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</FormField>
				<FormField
					label={t("signUp.passwordLabel")}
					hint={t("signUp.passwordHint")}
					error={
						errors.password && t(`signUp.passwordErrors.${errors.password}`)
					}
				>
					<PasswordInput
						autoComplete="new-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</FormField>
				<Button type="submit" loading={register.isPending}>
					{t("signUp.action")}
				</Button>
				{register.isError && !usernameTaken && (
					<p role="alert" className="text-sm text-danger-text">
						{errorMessage(register.error)}
					</p>
				)}
			</form>
			{children}
		</>
	);
}
