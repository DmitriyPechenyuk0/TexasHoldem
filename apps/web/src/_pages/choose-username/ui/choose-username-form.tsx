"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import {
	type UsernameError,
	usernameError,
	VIEWER_QUERY_KEY,
} from "@/entities/viewer";
import { ApiError, http } from "@/shared/api";
import { useErrorMessage, useRouter } from "@/shared/i18n";
import { Button, FormField, Input } from "@/shared/ui";
import { chooseUsername } from "../api/choose-username";

/** The username field; once stored, the viewer goes on to `next`. */
export function ChooseUsernameForm({ next }: { readonly next: string }) {
	// One translator for both namespaces: the username's texts are shared with sign-up.
	const t = useTranslations("auth");
	const errorMessage = useErrorMessage();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [username, setUsername] = useState("");
	const [error, setError] = useState<UsernameError | "taken" | null>(null);
	const goOn = () => {
		router.replace(next);
		// Server Components read the account too; render them again with the username.
		router.refresh();
	};
	const choose = useMutation({
		mutationFn: () => chooseUsername(http, username),
		onSuccess: (me) => {
			queryClient.setQueryData(VIEWER_QUERY_KEY, me);
			goOn();
		},
		onError: (failure) => {
			if (!(failure instanceof ApiError)) {
				return;
			}
			if (failure.code === "identity.username-taken") {
				setError("taken");
			} else if (failure.code === "identity.username-already-chosen") {
				// Chosen in another tab: nothing left to do here.
				void queryClient.invalidateQueries({ queryKey: VIEWER_QUERY_KEY });
				goOn();
			}
		},
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const invalid = usernameError(username);
		setError(invalid);
		if (!invalid) {
			choose.mutate();
		}
	};

	const handled =
		choose.error instanceof ApiError &&
		(choose.error.code === "identity.username-taken" ||
			choose.error.code === "identity.username-already-chosen");

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-4">
			<FormField
				label={t("username.label")}
				hint={t("username.hint")}
				error={error ? t(`username.errors.${error}`) : undefined}
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
			<Button type="submit" loading={choose.isPending || choose.isSuccess}>
				{t("chooseUsername.action")}
			</Button>
			{choose.isError && !handled && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(choose.error)}
				</p>
			)}
		</form>
	);
}
