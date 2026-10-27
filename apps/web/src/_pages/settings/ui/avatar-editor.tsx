"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import {
	MY_PROFILE_QUERY_KEY,
	type MyProfile,
	UserAvatar,
} from "@/entities/user";
import { http } from "@/shared/api";
import { useErrorMessage } from "@/shared/i18n";
import { Button } from "@/shared/ui";
import {
	confirmAvatar,
	removeAvatar,
	requestAvatarUpload,
	uploadToStorage,
} from "../api/profile";
import {
	AVATAR_ACCEPT,
	type AvatarFileError,
	avatarFileError,
	isAvatarType,
} from "../model/avatar-file";

/**
 * The avatar with its upload: the picked picture shows at once, filling the circle without
 * cropping by hand, while it uploads with progress; then the api's square version replaces it.
 */
export function AvatarEditor({ profile }: { readonly profile: MyProfile }) {
	const t = useTranslations("settings.profile.avatar");
	const errorMessage = useErrorMessage();
	const queryClient = useQueryClient();
	const input = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const [preview, setPreview] = useState<string | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [fileError, setFileError] = useState<AvatarFileError | null>(null);

	// The preview's object URL lives as long as it is shown.
	useEffect(
		() => () => {
			if (preview) {
				URL.revokeObjectURL(preview);
			}
		},
		[preview],
	);

	const saved = (updated: MyProfile) => {
		queryClient.setQueryData(MY_PROFILE_QUERY_KEY, updated);
		setPreview(null);
	};
	const upload = useMutation({
		mutationFn: async (file: File) => {
			if (!isAvatarType(file.type)) {
				throw new Error("checked before");
			}
			const ticket = await requestAvatarUpload(http, file.type);
			setProgress(0);
			await uploadToStorage(ticket, file, setProgress);
			return confirmAvatar(http, ticket.key);
		},
		onSuccess: saved,
		onError: () => setPreview(null),
		onSettled: () => setProgress(null),
	});
	const remove = useMutation({
		mutationFn: () => removeAvatar(http),
		onSuccess: saved,
	});

	const pick = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// The same file can be picked again after a failure.
		event.target.value = "";
		if (!file) {
			return;
		}
		const invalid = avatarFileError(file);
		setFileError(invalid);
		upload.reset();
		remove.reset();
		if (!invalid) {
			setPreview(URL.createObjectURL(file));
			upload.mutate(file);
		}
	};

	const busy = upload.isPending || remove.isPending;
	const failure = upload.error ?? remove.error;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-4">
				<UserAvatar
					username={profile.username}
					nickname={profile.nickname}
					avatarUrl={preview ?? profile.avatarUrl}
					size="xl"
					className={busy ? "opacity-70" : undefined}
				/>
				<div className="flex flex-col items-start gap-2">
					<input
						ref={input}
						type="file"
						accept={AVATAR_ACCEPT}
						onChange={pick}
						className="sr-only"
						tabIndex={-1}
						aria-hidden="true"
					/>
					<Button
						variant="secondary"
						size="sm"
						loading={upload.isPending}
						disabled={busy}
						aria-describedby={hintId}
						onClick={() => input.current?.click()}
					>
						{t("upload")}
					</Button>
					{profile.avatarUrl && (
						<Button
							variant="ghost"
							size="sm"
							loading={remove.isPending}
							disabled={busy}
							onClick={() => remove.mutate()}
						>
							{t("remove")}
						</Button>
					)}
				</div>
			</div>
			<p id={hintId} className="text-xs text-muted-foreground">
				{t("hint")}
			</p>
			{progress !== null && (
				<div
					role="progressbar"
					aria-label={t("progress")}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(progress * 100)}
					className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
				>
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-fast"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			)}
			{upload.isSuccess && (
				<p role="status" className="text-sm text-muted-foreground">
					{t("saved")}
				</p>
			)}
			{(fileError || failure) && (
				<p role="alert" className="text-sm text-danger-text">
					{fileError ? t(`errors.${fileError}`) : errorMessage(failure)}
				</p>
			)}
		</div>
	);
}
