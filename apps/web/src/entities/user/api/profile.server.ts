import "server-only";
import { cache } from "react";
import { getServerHttp } from "@/shared/api/index.server";
import {
	fetchMyProfile,
	fetchPublicProfile,
	type MyProfile,
	type PublicProfile,
} from "./profile";

/** The viewer's profile for this request, read once per render. Render it inside `<Suspense>`. */
export const getMyProfile = cache(async (): Promise<MyProfile | null> =>
	fetchMyProfile(await getServerHttp()),
);

/** A public profile, read once per render however many components (and the metadata) ask. */
export const getPublicProfile = cache(
	async (username: string): Promise<PublicProfile | null> =>
		fetchPublicProfile(await getServerHttp(), username),
);
