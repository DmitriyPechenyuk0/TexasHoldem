import type { LegalActions } from "@holdem/shared/realtime";

export type Action =
	| { readonly action: "fold" | "check" | "call" | "all-in" }
	| { readonly action: "bet" | "raise"; readonly amount: number };

/**
 * A random action among the legal ones (`legalActions`, which the table computes with the
 * engine): mostly checks and calls, some bets and raises up to three times the minimum, a few
 * folds and the odd all-in, so hands reach every street and the showdown.
 */
/** What a player can always do on their turn: check when free, call otherwise. */
export const safeAction = (legal: LegalActions): Action => ({
	action: legal.canCheck ? "check" : "call",
});

export function chooseAction(
	legal: LegalActions,
	random: () => number = Math.random,
): Action {
	const roll = random();
	const { aggression } = legal;
	// Only while a raise is open: all in for more than the call is a raise of everything, which a
	// player facing a short all-in, whose betting is not reopened, may not make.
	if (roll < 0.03 && aggression) {
		return { action: "all-in" };
	}
	if (roll < 0.25 && aggression) {
		const top = Math.min(aggression.maxTo, aggression.minTo * 3);
		const amount =
			aggression.minTo + Math.floor(random() * (top - aggression.minTo + 1));
		return { action: aggression.kind, amount };
	}
	if (roll < 0.35 && legal.callAmount > 0) {
		return { action: "fold" };
	}
	return safeAction(legal);
}
