import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { MuteListRepository } from "../../../domain/mute-list.repository.js";
import { GetMutedIdsQuery } from "./get-muted-ids.query.js";

@QueryHandler(GetMutedIdsQuery)
export class GetMutedIdsHandler implements IQueryHandler<GetMutedIdsQuery> {
	constructor(private readonly mutes: MuteListRepository) {}

	async execute({ userId }: GetMutedIdsQuery): Promise<readonly string[]> {
		return (await this.mutes.mutedBy(userId)).map(({ mutedId }) => mutedId);
	}
}
