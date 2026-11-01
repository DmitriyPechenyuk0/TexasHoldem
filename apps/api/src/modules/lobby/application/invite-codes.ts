import { randomInt } from "node:crypto";
import {
	INVITE_CODE_ALPHABET,
	INVITE_CODE_LENGTH,
} from "../domain/lobby-table.js";

/** A fresh invite code, each character drawn evenly from the alphabet by the CSPRNG. */
export const newInviteCode = (): string =>
	Array.from(
		{ length: INVITE_CODE_LENGTH },
		() => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)],
	).join("");

/** Tries at a free code before giving up: with 31^8 codes a clash is already rare. */
export const INVITE_CODE_TRIES = 3;
