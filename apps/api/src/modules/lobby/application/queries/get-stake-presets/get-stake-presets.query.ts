import { Query } from "@nestjs/cqrs";
import type { StakePreset } from "../../../domain/stake-presets.js";

/** The stakes a table can be created with, from the smallest. */
export class GetStakePresetsQuery extends Query<readonly StakePreset[]> {}
