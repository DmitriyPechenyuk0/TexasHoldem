"use client";

import { useQuery } from "@tanstack/react-query";
import { type Viewer, viewerQuery } from "../api/viewer";

/**
 * The signed-in user: null without a session, undefined until known. The layout prefetches it on
 * the server, so a rendered page already knows it and nothing flashes.
 */
export function useViewer(): Viewer | null | undefined {
	return useQuery(viewerQuery()).data;
}
