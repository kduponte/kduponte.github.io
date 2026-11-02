import { describe, expect, it } from "vitest";
import { mulberry32, standardNormal } from "../../src/lib/stats-sim/rng";
import { blockBootstrapMean, excludesZero } from "../../src/lib/surf-forecast/bootstrap";

/** Days of `perDay` values each, with a shared per-day effect and an AR(1) link between days. */
function clusteredDays(nDays: number, perDay: number, opts: { daySd: number; noiseSd: number; ar: number; seed: number }) {
	const rng = mulberry32(opts.seed);
	const days: number[][] = [];
	let effect = 0;
	for (let d = 0; d < nDays; d++) {
		effect = opts.ar * effect + Math.sqrt(1 - opts.ar ** 2) * opts.daySd * standardNormal(rng);
		days.push(Array.from({ length: perDay }, () => effect + opts.noiseSd * standardNormal(rng)));
	}
	return days;
}

describe("blockBootstrapMean", () => {
	it("estimates the pooled mean of every value", () => {
		const r = blockBootstrapMean([[1, 2], [3], [4, 5, 6]]);
		expect(r?.estimate).toBeCloseTo(21 / 6, 12);
		expect(r?.n_values).toBe(6);
		expect(r?.n_days).toBe(3);
	});

	it("agrees with the naive standard error when values really are independent", () => {
		const days = clusteredDays(300, 4, { daySd: 0, noiseSd: 1, ar: 0, seed: 1 });
		const r = blockBootstrapMean(days, { resamples: 3000, seed: 2 });
		expect(r).not.toBeNull();
		const ratio = (r?.se_block ?? 0) / (r?.se_naive ?? 1);
		expect(ratio).toBeGreaterThan(0.8);
		expect(ratio).toBeLessThan(1.25);
	});

	it("widens the interval when errors cluster by day, which is the case it exists for", () => {
		// Within a day the four values nearly coincide, and consecutive days are correlated: the
		// shape of a forecast that misreads a swell for its whole lifetime.
		const days = clusteredDays(270, 4, { daySd: 1, noiseSd: 0.1, ar: 0.7, seed: 3 });
		const r = blockBootstrapMean(days, { resamples: 3000, seed: 4 });
		expect(r).not.toBeNull();
		expect(r?.se_block ?? 0).toBeGreaterThan(2 * (r?.se_naive ?? 0));
		// 1,080 values carrying the information of well under one value per day.
		expect(r?.effective_n ?? Infinity).toBeLessThan(r?.n_days ?? 0);
		const blockWidth = (r?.ci_high ?? 0) - (r?.ci_low ?? 0);
		const naiveWidth = (r?.naive_ci_high ?? 0) - (r?.naive_ci_low ?? 0);
		expect(blockWidth).toBeGreaterThan(2 * naiveWidth);
	});

	it("brackets its own estimate", () => {
		const days = clusteredDays(120, 4, { daySd: 0.5, noiseSd: 0.3, ar: 0.5, seed: 5 });
		const r = blockBootstrapMean(days, { seed: 6 });
		expect(r?.ci_low ?? Infinity).toBeLessThanOrEqual(r?.estimate ?? 0);
		expect(r?.ci_high ?? -Infinity).toBeGreaterThanOrEqual(r?.estimate ?? 0);
	});

	it("is deterministic for a fixed seed", () => {
		const days = clusteredDays(60, 4, { daySd: 1, noiseSd: 0.5, ar: 0.6, seed: 7 });
		expect(blockBootstrapMean(days, { seed: 99 })).toEqual(blockBootstrapMean(days, { seed: 99 }));
	});

	it("shrinks the block when the series is too short for the requested one", () => {
		const r = blockBootstrapMean([[1], [2], [3], [4], [5], [6]], { blockDays: 5 });
		expect(r?.block_days).toBe(3);
	});

	it("ignores empty days rather than treating them as zeros", () => {
		const withGaps = blockBootstrapMean([[1], [], [3], []], { seed: 1 });
		expect(withGaps?.estimate).toBeCloseTo(2, 12);
		expect(withGaps?.n_days).toBe(2);
	});

	it("declines to bootstrap a single day", () => {
		expect(blockBootstrapMean([[1, 2, 3]])).toBeNull();
		expect(blockBootstrapMean([])).toBeNull();
	});

	it("rejects confidence levels it has no critical value for", () => {
		expect(() => blockBootstrapMean([[1], [2], [3]], { level: 0.8 })).toThrow();
	});
});

describe("excludesZero", () => {
	it("is true only when the whole interval sits on one side of zero", () => {
		expect(excludesZero(0.1, 0.4)).toBe(true);
		expect(excludesZero(-0.4, -0.1)).toBe(true);
		expect(excludesZero(-0.1, 0.4)).toBe(false);
		expect(excludesZero(0, 0.4)).toBe(false);
	});
});
