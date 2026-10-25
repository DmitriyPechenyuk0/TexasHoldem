"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { VIEWER_QUERY_KEY } from "@/entities/viewer";
import { http } from "@/shared/api";
import { useRouter } from "@/shared/i18n";
import { ROUTES } from "@/shared/config";
import { endSessionState } from "@/shared/lib";

const SignOutResponse = z.object({ success: z.boolean() });

/**
 * Ends the session on the api, then forgets everything cached for the viewer (the query cache and
 * the stores registered with `onSessionEnd`) and re-renders home without it.
 */
export function useSignOut() {
	const queryClient = useQueryClient();
	const router = useRouter();

	return useMutation({
		mutationFn: () =>
			http.request("/auth/sign-out", {
				method: "POST",
				body: {},
				schema: SignOutResponse,
			}),
		onSuccess: () => {
			queryClient.clear();
			endSessionState();
			queryClient.setQueryData(VIEWER_QUERY_KEY, null);
			router.replace(ROUTES.home);
			// Server Components read the session too; render them again without it.
			router.refresh();
		},
	});
}
