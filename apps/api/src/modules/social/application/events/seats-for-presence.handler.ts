import { EventBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { TableSummaryChanged } from "@/modules/table/index.js";
import { PlayerPresence } from "../player-presence.js";
import { PresenceChanged } from "./presence-changed.event.js";

/** Keeps where players sit from the tables' summaries; friends hear of it for players online. */
@EventsHandler(TableSummaryChanged)
export class SeatsForPresenceHandler implements IEventHandler<TableSummaryChanged> {
	private readonly logger = new Logger(SeatsForPresenceHandler.name);

	constructor(
		private readonly presence: PlayerPresence,
		private readonly eventBus: EventBus,
	) {}

	async handle({
		tableId,
		status,
		players,
	}: TableSummaryChanged): Promise<void> {
		try {
			const changed = await this.presence.seat(
				tableId,
				status === "closed" ? [] : players.map(({ userId }) => userId),
			);
			const whereabouts = await this.presence.whereabouts(changed);
			for (const userId of changed) {
				if (whereabouts.get(userId)?.online) {
					this.eventBus.publish(new PresenceChanged(userId));
				}
			}
		} catch (error) {
			this.logger.warn({
				msg: "seats not kept for presence",
				tableId,
				err: error,
			});
		}
	}
}
