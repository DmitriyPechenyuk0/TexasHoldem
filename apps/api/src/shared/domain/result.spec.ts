import { DomainError } from "./domain-error.js";
import { err, ok, type Result } from "./result.js";

class SeatTakenError extends DomainError {
	readonly kind = "conflict";
	readonly code = "table.seat-taken";
}

const takeSeat = (seat: number, taken: readonly number[]): Result<number> =>
	taken.includes(seat)
		? err(new SeatTakenError(`Seat ${seat} is taken`))
		: ok(seat);

describe("Result", () => {
	it("carries the value on success", () => {
		expect(takeSeat(3, [1, 2])).toEqual({ ok: true, value: 3 });
	});

	it("carries a typed domain error on failure", () => {
		const result = takeSeat(1, [1, 2]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(SeatTakenError);
			expect(result.error).toMatchObject({
				name: "SeatTakenError",
				kind: "conflict",
				code: "table.seat-taken",
				message: "Seat 1 is taken",
			});
		}
	});
});
