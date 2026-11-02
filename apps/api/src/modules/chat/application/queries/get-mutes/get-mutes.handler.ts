import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { GetPlayerCardsQuery } from "@/shared/application/player-directory.js";
import { MuteListRepository } from "../../../domain/mute-list.repository.js";
import { GetMutesQuery, type MutedPlayer } from "./get-mutes.query.js";

@QueryHandler(GetMutesQuery)
export class GetMutesHandler implements IQueryHandler<GetMutesQuery> {
	constructor(
		private readonly mutes: MuteListRepository,
		private readonly queryBus: QueryBus,
	) {}

	async execute({ userId }: GetMutesQuery): Promise<readonly MutedPlayer[]> {
		const muted = await this.mutes.mutedBy(userId);
		const cards = await this.queryBus.execute(
			new GetPlayerCardsQuery(muted.map(({ mutedId }) => mutedId)),
		);
		const byId = new Map(cards.map((card) => [card.userId, card]));
		return muted.flatMap(({ mutedId, mutedAt }) => {
			const card = byId.get(mutedId);
			return card ? [{ ...card, mutedAt }] : [];
		});
	}
}
