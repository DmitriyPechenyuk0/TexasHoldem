"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError, http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
	type PasswordError,
	passwordError,
	VIEWER_QUERY_KEY,
} from "@/entities/viewer";
import { Link, useErrorMessage } from "@/shared/i18n";
import { endSessionState } from "@/shared/lib";
import {
	Button,
	CardDescription,
	CardTitle,
	FormField,
	PasswordInput,
} from "@/shared/ui";
import { resetPassword } from "../api/reset-password";
import { InvalidResetLink } from "./invalid-reset-link";

/** The new password for the account behind `token`, which the emailed link carried. */
export function ResetPasswordForm({ token }: { readonly token: string }) {
	const t = useTranslations("auth.resetPassword");
	const errorMessage = useErrorMessage();
	const queryClient = useQueryClient();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState<PasswordError | null>(null);
	const reset = useMutation({
		mutationFn: () => resetPassword(http, token, password),
		onSuccess: () => {
			// Every session of the account has ended, this browser's included.
			queryClient.clear();
			endSessionState();
			queryClient.setQueryData(VIEWER_QUERY_KEY, null);
		},
	});

	// The token stays in memory only: out of the address bar, history and screenshots. The path
	// comes from the location, since `usePathname` leaves out the locale.
	useEffect(() => {
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	if (
		reset.isError &&
		reset.error instanceof ApiError &&
		reset.error.code === "auth.invalid-token"
	) {
		return <InvalidResetLink />;
	}

	if (reset.isSuccess) {
		return (
			<>
				<CardTitle>{t("done.title")}</CardTitle>
				<CardDescription role="status">{t("done.description")}</CardDescription>
				<Button asChild>
					<Link href={ROUTES.signIn}>{t("done.signIn")}</Link>
				</Button>
			</>
		);
	}

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const invalid = passwordError(password, confirmation);
		setError(invalid);
		if (!invalid) {
			reset.mutate();
		}
	};

	return (
		<>
			<CardTitle>{t("title")}</CardTitle>
			<CardDescription>{t("description")}</CardDescription>
			<form onSubmit={submit} noValidate className="flex flex-col gap-4">
				<FormField
					label={t("passwordLabel")}
					hint={t("passwordHint")}
					error={
						error === "tooShort" || error === "tooLong"
							? t(`errors.${error}`)
							: undefined
					}
				>
					<PasswordInput
						autoComplete="new-password"
						autoFocus
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</FormField>
				<FormField
					label={t("confirmationLabel")}
					error={error === "mismatch" ? t("errors.mismatch") : undefined}
				>
					<PasswordInput
						autoComplete="new-password"
						value={confirmation}
						onChange={(event) => setConfirmation(event.target.value)}
					/>
				</FormField>
				<Button type="submit" loading={reset.isPending}>
					{t("action")}
				</Button>
				{reset.isError && (
					<p role="alert" className="text-sm text-danger-text">
						{errorMessage(reset.error)}
					</p>
				)}
			</form>
		</>
	);
}
