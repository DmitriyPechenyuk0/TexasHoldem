"use client";

import { useTranslations } from "next-intl";
import { useMyProfile } from "@/entities/user";
import { profilePath } from "@/shared/config";
import { Link } from "@/shared/i18n";
import { Spinner } from "@/shared/ui";
import { AvatarEditor } from "./avatar-editor";
import { NicknameForm } from "./nickname-form";

/** How others see the player: avatar and nickname, with a link to the public page. */
export function ProfileTab() {
	const t = useTranslations("settings.profile");
	const profile = useMyProfile();

	if (profile === undefined) {
		return <Spinner className="self-center" />;
	}
	if (profile === null) {
		// Created a moment after the account; a reload finds it.
		return <p className="text-sm text-muted-foreground">{t("missing")}</p>;
	}
	return (
		<div className="flex flex-col gap-6">
			<AvatarEditor profile={profile} />
			<NicknameForm key={profile.nickname} profile={profile} />
			<Link
				href={profilePath(profile.username)}
				className="focus-ring self-start rounded-sm text-sm underline underline-offset-4"
			>
				{t("viewPublic")}
			</Link>
		</div>
	);
}
