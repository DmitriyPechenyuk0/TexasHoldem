import { legalActions } from "../hand/betting.js";
import type { HandCommand } from "../hand/commands.js";
import type { HandConfig } from "../hand/config.js";
import type { HandEvent } from "../hand/events.js";
import { decide } from "../hand/decide.js";
import { evolve } from "../hand/evolve.js";
import {
	type ActiveHand,
	type HandState,
	initialHandState,
} from "../hand/state.js";

/**
 * A command the player whose turn it is may send, chosen by `pick`: while betting, mostly a check
 * or call, sometimes a bet or raise of a size in range, a fold or a timeout; at the showdown, show,
 * muck or let the timer muck.
 */
export function randomCommand(
	hand: ActiveHand,
	pick: () => number,
): HandCommand {
	const seat = hand.toAct as number;
	if (hand.street === "showdown") {
		const type = (["ShowCards", "MuckCards", "Timeout"] as const)[pick() % 3]!;
		return { type, seat };
	}
	const legal = legalActions(hand, seat)!;
	const passive: HandCommand = {
		type: "Act",
		seat,
		action: legal.canCheck ? "check" : "call",
	};
	const options: HandCommand[] = [
		passive,
		passive,
		passive,
		{ type: "Act", seat, action: "fold" },
		{ type: "Timeout", seat },
	];
	if (legal.aggression) {
		const { kind, minTo, maxTo } = legal.aggression;
		const amount = minTo + (pick() % (maxTo - minTo + 1));
		options.push({ type: "Act", seat, action: kind, amount });
	}
	return options[pick() % options.length]!;
}

/**
 * Plays a whole hand from `config`, every decision taken by the next number of `picks` (reused in
 * a cycle, so at least one), and returns all its events. For property tests: any `picks` gives a
 * legal hand.
 */
export function simulateHand(
	config: HandConfig,
	picks: readonly number[],
): HandEvent[] {
	let next = 0;
	const pick = () => picks[next++ % picks.length] as number;
	const events: HandEvent[] = [];
	let state: HandState = initialHandState;
	let command: HandCommand = { type: "StartHand", config };
	for (;;) {
		const decision = decide(command, state);
		if (!decision.ok) {
			throw new Error(`${command.type} was rejected: ${decision.error.code}`);
		}
		events.push(...decision.events);
		state = decision.events.reduce(evolve, state);
		if (state.status !== "in-progress") {
			break;
		}
		command = randomCommand(state, pick);
	}
	return events;
}
