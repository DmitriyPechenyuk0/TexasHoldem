"use client";

import { useQuery } from "@tanstack/react-query";
import { type MyProfile, myProfileQuery } from "../api/profile";

/**
 * The viewer's profile: null without one, undefined until known. The layout prefetches it, and
 * every change writes the answer back here, so the header follows a new nickname at once.
 */
export function useMyProfile(): MyProfile | null | undefined {
	return useQuery(myProfileQuery()).data;
}
