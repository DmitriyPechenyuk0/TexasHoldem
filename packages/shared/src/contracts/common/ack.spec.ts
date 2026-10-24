import { z } from "zod";
import { type Ack, ackOf } from "./ack.js";

describe("ackOf", () => {
	const SeatAck = ackOf(z.object({ seat: z.int() }));

	it("accepts a successful reply with its data", () => {
		expect(SeatAck.parse({ ok: true, data: { seat: 3 } })).toEqual({
			ok: true,
			data: { seat: 3 },
		});
	});

	it("accepts a failed reply carrying a problem", () => {
		const reply: Ack<{ seat: number }> = SeatAck.parse({
			ok: false,
			error: {
				type: "about:blank",
				title: "Conflict",
				status: 409,
				code: "table.seat-taken",
			},
		});

		expect(reply.ok ? undefined : reply.error.code).toBe("table.seat-taken");
	});

	it("rejects a reply that mixes both shapes", () => {
		expect(SeatAck.safeParse({ ok: true, error: {} }).success).toBe(false);
		expect(SeatAck.safeParse({ ok: false, data: { seat: 3 } }).success).toBe(
			false,
		);
	});
});
