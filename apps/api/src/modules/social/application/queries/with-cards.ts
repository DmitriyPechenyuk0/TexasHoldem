import type { QueryBus } from "@nestjs/cqrs";
import {
	GetPlayerCardsQuery,
	type PlayerCard,
} from "@/shared/application/player-directory.js";

/**
 * Each row with the card of its player, in the rows' order; a row whose player has no card (no
 * profile yet) is left out.
 */
export async function withCards<T extends { readonly userId: string }>(
	queryBus: QueryBus,
	rows: readonly T[],
): Promise<(T & PlayerCard)[]> {
	const cards = await queryBus.execute(
		new GetPlayerCardsQuery(rows.map(({ userId }) => userId)),
	);
	const byId = new Map(cards.map((card) => [card.userId, card]));
	return rows.flatMap((row) => {
		const card = byId.get(row.userId);
		return card ? [{ ...row, ...card }] : [];
	});
}
