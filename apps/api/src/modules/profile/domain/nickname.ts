import { DomainError } from "@/shared/domain/domain-error.js";
import { err, ok, type Result } from "@/shared/domain/result.js";

/** In characters (code points), once trimmed; `NICKNAME_LENGTH` in the shared contract says the same. */
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 24;

/**
 * Letters and marks of any script, digits, spaces and `_ . - '`. Leaves out emoji, symbols, and
 * the invisible and direction-changing characters that would let one nickname pose as another.
 */
const ALLOWED = /^[\p{L}\p{M}\p{N} _.'-]+$/u;

/** The display name at the table: not unique, unlike the username. */
export type Nickname = string & { readonly __brand: "Nickname" };

export class NicknameTooShortError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "profile.nickname-too-short";

	constructor() {
		super(`A nickname needs at least ${NICKNAME_MIN_LENGTH} characters`, {
			params: { min: NICKNAME_MIN_LENGTH },
		});
	}
}

export class NicknameTooLongError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "profile.nickname-too-long";

	constructor() {
		super(`A nickname has at most ${NICKNAME_MAX_LENGTH} characters`, {
			params: { max: NICKNAME_MAX_LENGTH },
		});
	}
}

export class NicknameInvalidCharactersError extends DomainError {
	readonly kind = "rule-violation";
	readonly code = "profile.nickname-invalid-characters";

	constructor() {
		super("A nickname may hold letters, digits, spaces and _ . - ' only");
	}
}

export type InvalidNicknameError =
	NicknameTooShortError | NicknameTooLongError | NicknameInvalidCharactersError;

/**
 * A nickname from what the player typed: normalised to NFKC, trimmed, with each run of spaces
 * collapsed to one. NFKC counts "é" once however it was typed, and turns look-alike variants
 * (fullwidth "Ａ", mathematical "𝓐") into the plain letter.
 */
export function parseNickname(
	input: string,
): Result<Nickname, InvalidNicknameError> {
	const nickname = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
	// Code points: graphemes would let one character carry any number of combining marks.
	const length = Array.from(nickname).length;
	if (length < NICKNAME_MIN_LENGTH) {
		return err(new NicknameTooShortError());
	}
	if (length > NICKNAME_MAX_LENGTH) {
		return err(new NicknameTooLongError());
	}
	if (!ALLOWED.test(nickname)) {
		return err(new NicknameInvalidCharactersError());
	}
	return ok(nickname as Nickname);
}
