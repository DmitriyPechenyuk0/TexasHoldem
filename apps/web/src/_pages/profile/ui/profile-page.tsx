import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { UserAvatar } from "@/entities/user";
import { getPublicProfile } from "@/entities/user/index.server";
import { Card, Spinner } from "@/shared/ui";

export interface ProfileParams {
	readonly username: string;
}

async function ProfileContent({
	params,
}: {
	readonly params: Promise<ProfileParams>;
}) {
	const { username } = await params;
	const profile = await getPublicProfile(decodeURIComponent(username));
	if (!profile) {
		notFound();
	}
	const t = await getTranslations("profile");
	const format = await getFormatter();

	return (
		<div className="flex flex-col items-center gap-3 text-center">
			<UserAvatar
				username={profile.username}
				nickname={profile.nickname}
				avatarUrl={profile.avatarUrl}
				size="xl"
			/>
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-semibold tracking-tight break-words">
					{profile.nickname}
				</h1>
				<p className="text-muted-foreground">@{profile.username}</p>
			</div>
			<p className="text-sm text-muted-foreground">
				{t("memberSince", {
					// With the day, so Russian puts the month in the right case.
					date: format.dateTime(new Date(profile.createdAt), {
						dateStyle: "long",
					}),
				})}
			</p>
		</div>
	);
}

/**
 * A player as anyone sees them: avatar, nickname, @username and since when they play. Stats join
 * it once they exist.
 */
export function ProfilePage({
	params,
}: {
	readonly params: Promise<ProfileParams>;
}) {
	return (
		<main className="flex flex-1 items-start justify-center px-4 py-12">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<Spinner className="self-center" />}>
					<ProfileContent params={params} />
				</Suspense>
			</Card>
		</main>
	);
}
