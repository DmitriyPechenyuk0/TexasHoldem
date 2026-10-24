import {
	decide,
	deriveHandSeed,
	evolve,
	type HandCommand,
	type HandState,
	initialHandState,
	legalActions,
	shuffleDeck,
} from "@holdem/engine";

// The deck comes from the server seed (ADR-008); a real table draws it with crypto.getRandomValues.
const serverSeed = new Uint8Array(32).fill(7);
const deck = shuffleDeck(deriveHandSeed(serverSeed, "hand-1"));
const players = ["ann", "bob", "cat"].map((playerId, seat) => ({
	seat,
	playerId,
	stack: 1000,
}));

let state: HandState = initialHandState;
function send(command: HandCommand) {
	const decision = decide(command, state);
	if (!decision.ok) throw new Error(decision.error.code);
	state = decision.events.reduce(evolve, state);
}

send({
	type: "StartHand",
	config: {
		handId: "hand-1",
		smallBlind: 5,
		bigBlind: 10,
		ante: 0,
		buttonSeat: 0,
		smallBlindSeat: 1,
		bigBlindSeat: 2,
		players,
		deck,
	},
});
// Everyone checks or calls down; at the showdown a beaten hand is shown rather than mucked.
while (state.status === "in-progress") {
	const seat = state.toAct!;
	const legal = legalActions(state, seat);
	send(
		legal
			? { type: "Act", seat, action: legal.canCheck ? "check" : "call" }
			: { type: "ShowCards", seat },
	);
}
if (state.status === "ended") {
	const stacks = state.players.map(
		({ playerId, stack }) => `${playerId} ${stack}`,
	);
	console.log(stacks.join(", "));
}
