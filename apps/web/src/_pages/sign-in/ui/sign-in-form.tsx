"use client";

import {
	Email,
	SignInUsernameRequest,
} from "@holdem/shared/contracts/identity";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { fetchViewer, VIEWER_QUERY_KEY } from "@/entities/viewer";
import { ApiError, http } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { getPathname, Link, useErrorMessage, useRouter } from "@/shared/i18n";
import { Button, FormField, Input, PasswordInput } from "@/shared/ui";
import { signInWithPassword } from "../api/sign-in";

const validIdentifier = (identifier: string) =>
	identifier.includes("@")
		? Email.safeParse(identifier).success
		: SignInUsernameRequest.shape.username.safeParse(identifier).success;

/** Email or username and password; on success the viewer goes on to `next`. */
export function SignInForm({ next }: { readonly next: string | null }) {
	const t = useTranslations("auth.signIn");
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [invalid, setInvalid] = useState({
		identifier: false,
		password: false,
	});
	const signIn = useMutation({
		mutationFn: () =>
			signInWithPassword(http, {
				identifier: identifier.trim(),
				password,
				callbackURL: getPathname({
					href: {
						pathname: ROUTES.verifyEmail,
						query: next ? { next } : {},
					},
					locale,
				}),
			}),
		onSuccess: async () => {
			queryClient.setQueryData(VIEWER_QUERY_KEY, await fetchViewer(http));
			router.replace(next ?? ROUTES.home);
			// Server Components read the session too; render them again with it.
			router.refresh();
		},
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const checked = {
			identifier: !validIdentifier(identifier.trim()),
			password: password === "",
		};
		setInvalid(checked);
		if (!checked.identifier && !checked.password) {
			signIn.mutate();
		}
	};

	const unverified =
		signIn.error instanceof ApiError &&
		signIn.error.code === "auth.email-not-verified";

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-4">
			<FormField
				label={t("identifierLabel")}
				error={invalid.identifier ? t("identifierInvalid") : undefined}
			>
				<Input
					autoComplete="username"
					autoCapitalize="none"
					spellCheck={false}
					autoFocus
					value={identifier}
					onChange={(event) => setIdentifier(event.target.value)}
				/>
			</FormField>
			<div className="flex flex-col gap-1.5">
				<FormField
					label={t("passwordLabel")}
					error={invalid.password ? t("passwordMissing") : undefined}
				>
					<PasswordInput
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</FormField>
				<Link
					href={ROUTES.forgotPassword}
					className="focus-ring self-end rounded-sm text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					{t("forgotPassword")}
				</Link>
			</div>
			<Button type="submit" loading={signIn.isPending || signIn.isSuccess}>
				{t("action")}
			</Button>
			{signIn.isError &&
				(unverified ? (
					<p role="status" className="text-sm text-muted-foreground">
						{t("unverified")}
					</p>
				) : (
					<p role="alert" className="text-sm text-danger-text">
						{errorMessage(signIn.error)}
					</p>
				))}
		</form>
	);
}
