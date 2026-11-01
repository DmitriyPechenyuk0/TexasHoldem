/** Stakes a table can be created with: its blinds, and the buy-in range in big blinds. */
export interface StakePreset {
	readonly id: string;
	readonly smallBlind: number;
	readonly bigBlind: number;
	readonly minBuyInBigBlinds: number;
	readonly maxBuyInBigBlinds: number;
}

const preset = (id: string, smallBlind: number): StakePreset => ({
	id,
	smallBlind,
	bigBlind: smallBlind * 2,
	minBuyInBigBlinds: 40,
	maxBuyInBigBlinds: 100,
});

/** From the smallest. Chips are unlimited (ADR-009): stakes only set the size of the game. */
export const STAKE_PRESETS: readonly StakePreset[] = [
	preset("micro", 1),
	preset("low", 5),
	preset("mid", 25),
	preset("high", 100),
];

export const presetById = (id: string): StakePreset | undefined =>
	STAKE_PRESETS.find((candidate) => candidate.id === id);
