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
