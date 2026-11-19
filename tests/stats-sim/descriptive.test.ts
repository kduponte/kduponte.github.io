import { describe, expect, it } from "vitest";
import { median, quantile, wilsonInterval } from "../../src/lib/stats-sim/descriptive";

describe("quantile / median", () => {
	it("interpolates linearly between order statistics", () => {
		expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
		expect(median([5, 1, 3])).toBe(3);
	});
});

describe("wilsonInterval", () => {
	it("matches a textbook value: 25 successes in 500 trials", () => {
		// p = 0.05, n = 500: Wilson 95% interval is about [0.0341, 0.0728].
		const ci = wilsonInterval(25, 500);
		expect(ci.low).toBeCloseTo(0.0341, 3);
		expect(ci.high).toBeCloseTo(0.0728, 3);
	});

	it("brackets the observed proportion", () => {
		const ci = wilsonInterval(57, 500);
		expect(ci.low).toBeLessThan(57 / 500);
		expect(ci.high).toBeGreaterThan(57 / 500);
	});

	it("stays inside [0, 1] at the extremes, where a normal interval would not", () => {
		const zero = wilsonInterval(0, 50);
		// Analytically exactly 0; floating point lands within 1e-17 of it.
		expect(zero.low).toBeGreaterThanOrEqual(0);
		expect(zero.low).toBeCloseTo(0, 12);
		expect(zero.high).toBeGreaterThan(0);
		const all = wilsonInterval(50, 50);
		expect(all.high).toBe(1);
		expect(all.low).toBeLessThan(1);
	});

	it("narrows with more trials", () => {
		const small = wilsonInterval(25, 500);
		const big = wilsonInterval(250, 5000);
		expect(big.high - big.low).toBeLessThan(small.high - small.low);
	});

	it("returns an empty interval for zero trials", () => {
		expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
	});
});
