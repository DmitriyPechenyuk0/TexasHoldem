import { z } from "zod";
import { Username } from "./credentials.js";

/**
 * `PUT /api/me/username`, signed in: the username of an account an OAuth sign-in created without
 * one, because the provider's handle was missing, invalid or taken. It is chosen once and answers
 * the account (`MeResponse`): 409 `identity.username-taken`, or `identity.username-already-chosen`.
 */
export const ChooseUsernameRequest = z.object({ username: Username });
export type ChooseUsernameRequest = z.infer<typeof ChooseUsernameRequest>;
