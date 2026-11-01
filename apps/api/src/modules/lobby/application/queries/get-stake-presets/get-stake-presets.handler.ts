import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import {
	type StakePreset,
	STAKE_PRESETS,
} from "../../../domain/stake-presets.js";
import { GetStakePresetsQuery } from "./get-stake-presets.query.js";

@QueryHandler(GetStakePresetsQuery)
export class GetStakePresetsHandler implements IQueryHandler<GetStakePresetsQuery> {
	async execute(): Promise<readonly StakePreset[]> {
		return STAKE_PRESETS;
	}
}
