import { percentile, Recorder, summarize } from "./stats.ts";

describe("stats", () => {
	it("takes percentiles by nearest rank", () => {
		const values = Array.from({ length: 100 }, (_, index) => index + 1);
		expect(percentile(values, 50)).toBe(50);
		expect(percentile(values, 95)).toBe(95);
		expect(percentile(values, 99)).toBe(99);
		expect(percentile(values, 100)).toBe(100);
		expect(percentile([7], 1)).toBe(7);
		expect(percentile([], 95)).toBe(0);
	});

	it("sums latencies up whatever their order", () => {
		expect(summarize([30, 10, 20])).toEqual({
			count: 3,
			p50: 20,
			p95: 30,
			p99: 30,
			max: 30,
		});
		expect(summarize([])).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
	});

	it("records latencies by kind and counts by name", () => {
		const recorder = new Recorder();
		recorder.latency("ack", 12);
		recorder.latency("ack", 8);
		recorder.count("error:table.closed");
		recorder.count("error:table.closed", 2);

		expect(recorder.summary()).toEqual({
			latencies: { ack: { count: 2, p50: 8, p95: 12, p99: 12, max: 12 } },
			counts: { "error:table.closed": 3 },
		});
	});
});
