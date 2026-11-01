import { PotsAwardedV1 } from "@holdem/shared/events";
import type { IEvent } from "@nestjs/cqrs";
import { IntegrationEvent } from "@/shared/application/integration-events.js";

export interface PotAward {
	readonly pot: number;
	readonly userId: string;
	readonly amount: number;
	/** The winning hand's category, when its winner showed it. */
	readonly category: string | null;
}

/**
 * Integration event: who won what in a hand, pot by pot. The chat's dealer announces it. Published
 * once, on the instance that runs the table, when the pots are awarded.
 */
@IntegrationEvent({
	name: "table.pots-awarded",
	version: 1,
	schema: PotsAwardedV1,
	broadcast: false,
})
export class PotsAwarded implements IEvent {
	constructor(
		readonly tableId: string,
		readonly handId: string,
		readonly awards: readonly PotAward[],
	) {}
}
