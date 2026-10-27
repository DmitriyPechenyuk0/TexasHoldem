import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPublicProfile } from "@/entities/user/index.server";
import type { ProfileParams } from "./profile-page";

export async function generateMetadata({
	params,
}: {
	readonly params: Promise<ProfileParams>;
}): Promise<Metadata> {
	const { username } = await params;
	const [profile, t] = await Promise.all([
		getPublicProfile(decodeURIComponent(username)),
		getTranslations("profile"),
	]);
	return {
		title: profile
			? t("metaTitle", {
					nickname: profile.nickname,
					username: profile.username,
				})
			: t("notFoundTitle"),
	};
}
