"use client";

import { useTranslations } from "next-intl";
import { UserAvatar, UserName, useMyProfile } from "@/entities/user";
import { useViewer } from "@/entities/viewer";
import { SignOutButton } from "@/features/sign-out";
import { ROUTES } from "@/shared/config";
import { Link } from "@/shared/i18n";
import { Button } from "@/shared/ui";

export function ViewerNav() {
	const t = useTranslations("common.header");
	const viewer = useViewer();

	if (viewer === undefined) {
		return null;
	}
	if (viewer === null) {
		return (
			<Button asChild size="sm">
				<Link href={ROUTES.signIn}>{t("signIn")}</Link>
			</Button>
		);
	}
	if (viewer.username === null) {
		return (
			<>
				<Button asChild variant="ghost" size="sm">
					<Link href={ROUTES.chooseUsername}>{t("chooseUsername")}</Link>
				</Button>
				<SignOutButton size="sm" />
			</>
		);
	}
	return (
		<>
			<Button asChild variant="ghost" size="sm" className="gap-2 px-2">
				<Link
					href={ROUTES.settings}
					aria-label={t("account", { username: viewer.username })}
				>
					<ViewerIdentity username={viewer.username} />
				</Link>
			</Button>
			<SignOutButton size="sm" />
		</>
	);
}

/** The avatar and nickname from the profile; the username alone until the profile is there. */
function ViewerIdentity({ username }: { readonly username: string }) {
	const profile = useMyProfile();

	if (!profile) {
		return <span>{username}</span>;
	}
	return (
		<>
			<UserAvatar
				username={profile.username}
				nickname={profile.nickname}
				avatarUrl={profile.avatarUrl}
				size="sm"
				className="size-6"
			/>
			<UserName
				nickname={profile.nickname}
				username={profile.username}
				className="max-w-40"
			/>
		</>
	);
}
