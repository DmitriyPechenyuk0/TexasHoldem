import {
	MyProfileResponse,
	PublicProfileResponse,
} from "@holdem/shared/contracts/profile";
import { queryOptions } from "@tanstack/react-query";
import { ApiError, http, type HttpClient } from "@/shared/api";

export type MyProfile = MyProfileResponse;
export type PublicProfile = PublicProfileResponse;

/**
 * The viewer's own profile; null without a session, or before the account has one (an OAuth
 * account that has not chosen its username yet).
 */
export async function fetchMyProfile(
	client: HttpClient,
	signal?: AbortSignal,
): Promise<MyProfile | null> {
	try {
		return await client.request("/profile", {
			schema: MyProfileResponse,
			signal,
		});
	} catch (error) {
		if (
			error instanceof ApiError &&
			(error.status === 401 || error.code === "profile.not-found")
		) {
			return null;
		}
		throw error;
	}
}

export const MY_PROFILE_QUERY_KEY = ["my-profile"] as const;

/** Pass `getServerHttp()` when prefetching in a Server Component. */
export const myProfileQuery = (client: HttpClient = http) =>
	queryOptions({
		queryKey: MY_PROFILE_QUERY_KEY,
		queryFn: ({ signal }) => fetchMyProfile(client, signal),
	});

/** Anyone's public profile by username, in any case; null when there is no such player. */
export async function fetchPublicProfile(
	client: HttpClient,
	username: string,
): Promise<PublicProfile | null> {
	try {
		return await client.request(`/profiles/${encodeURIComponent(username)}`, {
			schema: PublicProfileResponse,
		});
	} catch (error) {
		if (
			error instanceof ApiError &&
			(error.code === "profile.not-found" || error.code === "request.invalid")
		) {
			return null;
		}
		throw error;
	}
}
