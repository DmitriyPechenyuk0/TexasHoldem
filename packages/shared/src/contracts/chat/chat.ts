import { z } from "zod";
import { PlayerCard } from "../social/social.js";

/**
 * `GET /api/chat/mutes`: whom the signed-in player muted, latest first. Their chat messages are
 * hidden by the client, for this player only; the same ids come with each chat's `join`.
 */
export const MutedPlayer = PlayerCard.extend({ mutedAt: z.iso.datetime() });
export type MutedPlayer = z.infer<typeof MutedPlayer>;
export const MutesResponse = z.array(MutedPlayer).readonly();
export type MutesResponse = z.infer<typeof MutesResponse>;
