"use client";

import { NICKNAME_LENGTH } from "@holdem/shared/contracts/profile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { MY_PROFILE_QUERY_KEY, type MyProfile } from "@/entities/user";
import { ApiError, http } from "@/shared/api";
import { useErrorMessage } from "@/shared/i18n";
import { Button, FormField, Input } from "@/shared/ui";
import { updateNickname } from "../api/profile";

/** The display name; the api applies its rules, and the header shows the new one at once. */
export function NicknameForm({ profile }: { readonly profile: MyProfile }) {
	const t = useTranslations("settings.profile.nickname");
	const errorMessage = useErrorMessage();
	const queryClient = useQueryClient();
	const [nickname, setNickname] = useState(profile.nickname);
	const rename = useMutation({
		mutationFn: () => updateNickname(http, nickname),
		onSuccess: (updated) => {
			queryClient.setQueryData(MY_PROFILE_QUERY_KEY, updated);
			setNickname(updated.nickname);
		},
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		rename.mutate();
	};

	// A rule the nickname broke goes under the field; anything else under the form.
	const ruleBroken =
		rename.error instanceof ApiError &&
		rename.error.code.startsWith("profile.nickname-");

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-3">
			<FormField
				label={t("label")}
				hint={t("hint", NICKNAME_LENGTH)}
				error={ruleBroken ? errorMessage(rename.error) : undefined}
			>
				<Input
					autoComplete="nickname"
					value={nickname}
					onChange={(event) => {
						setNickname(event.target.value);
						rename.reset();
					}}
				/>
			</FormField>
			<Button
				type="submit"
				variant="secondary"
				className="self-start"
				loading={rename.isPending}
				disabled={nickname === profile.nickname}
			>
				{t("save")}
			</Button>
			{rename.isSuccess && (
				<p role="status" className="text-sm text-muted-foreground">
					{t("saved")}
				</p>
			)}
			{rename.isError && !ruleBroken && (
				<p role="alert" className="text-sm text-danger-text">
					{errorMessage(rename.error)}
				</p>
			)}
		</form>
	);
}
