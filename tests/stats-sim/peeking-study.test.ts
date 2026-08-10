import { describe, expect, it } from "vitest";
import { runPeekingStudy } from "../../src/lib/stats-sim/peeking-study";

// Shared null-true config used across these tests. The Bayesian threshold (0.975, not the more
// obvious 0.95) is deliberately calibrated so bayesian_final_day_rate lands near the same ~5%
// nominal rate as the frequentist test's final-day rate — without matching that baseline, the
// "any day vs. final day" inflation comparison between the two methods wouldn't be apples-to-apples.
const NULL_CONFIG = {
	true_rate: 0.1,
	visitors_per_day: 50,
	days: 20,
	trials: 800,
	seed: 5,
	frequentist_alpha: 0.05,
	bayesian_threshold: 0.975,
	mc_samples: 200,
};

describe("runPeekingStudy — this is the test that proves the story", () => {
	it("under the null, frequentist final-day-only rate is close to the nominal alpha", () => {
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.frequentist_final_day_rate).toBeGreaterThan(0.02);
		expect(result.frequentist_final_day_rate).toBeLessThan(0.09);
	});

	it("under the null, checking every day meaningfully inflates the frequentist false-positive rate above the final-day-only rate", () => {
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.frequentist_any_day_rate).toBeGreaterThan(result.frequentist_final_day_rate * 2);
		expect(result.frequentist_any_day_rate).toBeGreaterThan(0.15);
	});

	it("with a weak prior, the Bayesian threshold-crossing rate is also meaningfully inflated by peeking, not immune to it", () => {
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.bayesian_final_day_rate).toBeLessThan(0.09);
		expect(result.bayesian_any_day_rate).toBeGreaterThan(result.bayesian_final_day_rate * 2);
	});

	it("a stronger, more skeptical prior reduces the Bayesian any-day crossing rate", () => {
		const weak = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		const strong = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0.5, seed: NULL_CONFIG.seed + 1000 });
		expect(strong.bayesian_any_day_rate).toBeLessThan(weak.bayesian_any_day_rate);
	});

	it("first-crossing day lists only contain valid days and have length matching the any-day count", () => {
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.first_crossing_days_frequentist.every((d) => d >= 1 && d <= NULL_CONFIG.days)).toBe(true);
		expect(result.first_crossing_days_bayesian.every((d) => d >= 1 && d <= NULL_CONFIG.days)).toBe(true);
		expect(result.first_crossing_days_frequentist.length).toBeCloseTo(result.frequentist_any_day_rate * NULL_CONFIG.trials, 0);
		expect(result.first_crossing_days_bayesian.length).toBeCloseTo(result.bayesian_any_day_rate * NULL_CONFIG.trials, 0);
	});

	it("is deterministic for a fixed seed", () => {
		const a = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		const b = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(a).toEqual(b);
	});
});

describe("runPeekingStudy — the always-valid test's any-day rate, this is the test that proves the fix actually works", () => {
	it("under the null, the always-valid any-day rate stays at or below the nominal alpha", () => {
		// This is the actual theoretical guarantee (Ville's inequality): P(sup_t Lambda_t >= 1/alpha)
		// <= alpha for ANY stopping rule. It's an upper bound, not a target — empirically the rate
		// observed here is well under 5% (these tests are known to be conservative), so this
		// assertion has real headroom, not a knife's-edge tolerance.
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.always_valid_any_day_rate).toBeLessThanOrEqual(NULL_CONFIG.frequentist_alpha);
	});

	it("the always-valid any-day rate is dramatically lower than the frequentist and Bayesian any-day rates, at the same settings", () => {
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.always_valid_any_day_rate).toBeLessThan(result.frequentist_any_day_rate / 5);
		expect(result.always_valid_any_day_rate).toBeLessThan(result.bayesian_any_day_rate / 5);
	});

	it(
		"unlike the naive methods, the always-valid any-day rate does not grow as the monitoring window gets longer",
		() => {
			const shortWindow = runPeekingStudy({ ...NULL_CONFIG, days: 20, trials: 1500, seed: 200, prior_strength: 0 });
			const longWindow = runPeekingStudy({ ...NULL_CONFIG, days: 120, trials: 1500, seed: 200, prior_strength: 0 });
			// The naive frequentist rate visibly climbs with more looks (this is the whole peeking
			// story) — the always-valid rate should not climb anywhere near as much.
			expect(longWindow.frequentist_any_day_rate).toBeGreaterThan(shortWindow.frequentist_any_day_rate);
			expect(longWindow.always_valid_any_day_rate).toBeLessThan(shortWindow.always_valid_any_day_rate + 0.03);
		},
		15000,
	);

	it("first-crossing days for the always-valid method only contain valid days and match the any-day count", () => {
		const result = runPeekingStudy({ ...NULL_CONFIG, prior_strength: 0 });
		expect(result.first_crossing_days_always_valid.every((d) => d >= 1 && d <= NULL_CONFIG.days)).toBe(true);
		expect(result.first_crossing_days_always_valid.length).toBeCloseTo(result.always_valid_any_day_rate * NULL_CONFIG.trials, 0);
	});
});

describe("runPeekingStudy — revenue mode: the whole apparatus transfers correctly to a zero-inflated, right-skewed metric", () => {
	// Real production scale: 1% spend rate, 5,000/day (not 500,000, to keep this test file fast —
	// the 500,000/day case is covered by a dedicated performance test in sequential-experiment.test.ts).
	const REVENUE_NULL_CONFIG = {
		true_rate: 0.01,
		visitors_per_day: 5000,
		days: 20,
		trials: 800,
		seed: 5,
		frequentist_alpha: 0.05,
		bayesian_threshold: 0.975,
		mc_samples: 150,
		metric_type: "revenue" as const,
		avg_revenue_per_spender: 50,
	};

	it("under the null, frequentist and Bayesian final-day-only rates land near the nominal alpha, same as conversion mode", () => {
		const result = runPeekingStudy({ ...REVENUE_NULL_CONFIG, prior_strength: 0 });
		expect(result.frequentist_final_day_rate).toBeGreaterThan(0.02);
		expect(result.frequentist_final_day_rate).toBeLessThan(0.09);
		expect(result.bayesian_final_day_rate).toBeLessThan(0.09);
	});

	it("under the null, checking every day inflates both naive methods, the same story as conversion mode", () => {
		const result = runPeekingStudy({ ...REVENUE_NULL_CONFIG, prior_strength: 0 });
		expect(result.frequentist_any_day_rate).toBeGreaterThan(result.frequentist_final_day_rate * 2);
		expect(result.frequentist_any_day_rate).toBeGreaterThan(0.15);
		expect(result.bayesian_any_day_rate).toBeGreaterThan(result.bayesian_final_day_rate * 2);
	});

	it("the always-valid method's any-day rate stays low and dramatically below the naive methods, for revenue too", () => {
		const result = runPeekingStudy({ ...REVENUE_NULL_CONFIG, prior_strength: 0 });
		expect(result.always_valid_any_day_rate).toBeLessThanOrEqual(REVENUE_NULL_CONFIG.frequentist_alpha);
		expect(result.always_valid_any_day_rate).toBeLessThan(result.frequentist_any_day_rate / 5);
		expect(result.always_valid_any_day_rate).toBeLessThan(result.bayesian_any_day_rate / 5);
	});

	it("is deterministic for a fixed seed", () => {
		const a = runPeekingStudy({ ...REVENUE_NULL_CONFIG, prior_strength: 0 });
		const b = runPeekingStudy({ ...REVENUE_NULL_CONFIG, prior_strength: 0 });
		expect(a).toEqual(b);
	});
});
