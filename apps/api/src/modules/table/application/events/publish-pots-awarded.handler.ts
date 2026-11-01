import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { IntegrationEventBus } from "@/shared/application/integration-events.js";
import { type PotAward, PotsAwarded } from "./pots-awarded.event.js";
import { TableChanged } from "./table-changed.event.js";

/** Tells other contexts who won each pot of a hand, by user, with nothing secret in it. */
@EventsHandler(TableChanged)
export class PublishPotsAwardedHandler implements IEventHandler<TableChanged> {
	constructor(private readonly events: IntegrationEventBus) {}

	handle({ tableId, events, state }: TableChanged): void {
		const { table, hand } = state;
		if (table.status === "unopened" || hand.status === "idle") {
			return;
		}
		const userAt = new Map(
			table.players.map(({ seat, userId }) => [seat, userId]),
		);
		const awards: PotAward[] = events.hand.flatMap((event) =>
			event.type === "PotAwarded"
				? event.winners.flatMap(({ seat, amount, hand: shown }) => {
						const userId = userAt.get(seat);
						return userId
							? [
									{
										pot: event.pot,
										userId,
										amount,
										category: shown?.category ?? null,
									},
								]
							: [];
					})
				: [],
		);
		if (awards.length > 0) {
			this.events.publish(new PotsAwarded(tableId, hand.handId, awards));
		}
	}
}
