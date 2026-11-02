/** Latencies of one kind, in milliseconds, summed up by percentile. */
export interface LatencySummary {
	readonly count: number;
	readonly p50: number;
	readonly p95: number;
	readonly p99: number;
	readonly max: number;
}

/** The value below which `p` percent of the sorted values fall (nearest rank). */
export function percentile(sorted: readonly number[], p: number): number {
	if (sorted.length === 0) {
		return 0;
	}
	const rank = Math.ceil((p / 100) * sorted.length);
	return sorted[Math.min(sorted.length, Math.max(rank, 1)) - 1]!;
}

export function summarize(values: readonly number[]): LatencySummary {
	const sorted = values.toSorted((a, b) => a - b);
	return {
		count: sorted.length,
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		p99: percentile(sorted, 99),
		max: sorted.at(-1) ?? 0,
	};
}

/** What a run measures: latencies by kind, and how often each thing went wrong. */
export class Recorder {
	readonly latencies = new Map<string, number[]>();
	readonly counts = new Map<string, number>();

	latency(kind: string, ms: number): void {
		const values = this.latencies.get(kind) ?? [];
		values.push(ms);
		this.latencies.set(kind, values);
	}

	count(what: string, by = 1): void {
		this.counts.set(what, (this.counts.get(what) ?? 0) + by);
	}

	summary(): {
		readonly latencies: Readonly<Record<string, LatencySummary>>;
		readonly counts: Readonly<Record<string, number>>;
	} {
		return {
			latencies: Object.fromEntries(
				[...this.latencies].map(([kind, values]) => [kind, summarize(values)]),
			),
			counts: Object.fromEntries(this.counts),
		};
	}
}
