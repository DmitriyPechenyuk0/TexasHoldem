/** Port for the current time, so handlers stay deterministic under test. Domain code receives time as input. */
export abstract class Clock {
	abstract now(): Date;
}
