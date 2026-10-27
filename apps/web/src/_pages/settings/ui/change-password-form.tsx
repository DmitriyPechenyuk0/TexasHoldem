"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { type PasswordError, passwordError } from "@/entities/viewer";
import { ApiError, http } from "@/shared/api";
import { useErrorMessage } from "@/shared/i18n";
import { Button, FormField, PasswordInput } from "@/shared/ui";
import { changePassword } from "../api/profile";

/** The new password, after the current one; every other session ends with the change. */
export function ChangePasswordForm() {
	const t = useTranslations("settings.password");
	const errorMessage = useErrorMessage();
	const [current, setCurrent] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState<PasswordError | "missing" | null>(null);
	const change = useMutation({
		mutationFn: () =>
			changePassword(http, {
				currentPassword: current,
				newPassword: password,
			}),
		onSuccess: () => {
			setCurrent("");
			setPassword("");
			setConfirmation("");
		},
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const invalid =
			current === "" ? "missing" : passwordError(password, confirmation);
		setError(invalid);
		change.reset();
		if (!invalid) {
			change.mutate();
		}
	};

	const wrongCurrent =
		change.error instanceof ApiError &&
		change.error.code === "auth.invalid-password";

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-3">
			<FormField
				label={t("currentLabel")}
				error={
					error === "missing"
						? t("errors.missing")
						: wrongCurrent
							? errorMessage(change.error)
							: undefined
				}
			>
				<PasswordInput
					autoComplete="current-password"
					value={current}
					onChange={(event) => setCurrent(event.target.value)}
				/>
			</FormField>
			<FormField
				label={t("newLabel")}
				hint={t("newHint")}
				error={
					error === "tooShort" || error === "tooLong"
						? t(`errors.${error}`)
						: undefined
				}
			>
				<PasswordInput
					autoComplete="new-password"
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
			<Button
				type="submit"
				variant="secondary"
				className="self-start"
				loading={change.isPending}
			>
				{t("action")}
			</Button>
			{change.isSuccess && (
				<p role="status" className="text-sm text-muted-foreground">
					{t("done")}
				</p>
			)}
			{change.isError && !wrongCurrent && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(change.error)}
				</p>
			)}
		</form>
	);
}
