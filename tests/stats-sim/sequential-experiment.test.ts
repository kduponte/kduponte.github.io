import { describe, expect, it } from "vitest";
import { runSequentialExperiment } from "../../src/lib/stats-sim/sequential-experiment";

describe("runSequentialExperiment", () => {
	it("produces one snapshot per day, in order", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.1,
			true_rate_b: 0.1,
			visitors_per_day: 50,
			days: 15,
			prior_strength: 0,
			seed: 1,
			mc_samples: 200,
		});
		expect(result.days).toHaveLength(15);
		expect(result.days.map((d) => d.day)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
	});

	it("cumulative visitors and successes never decrease day over day", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.3,
			true_rate_b: 0.4,
			visitors_per_day: 40,
			days: 20,
			prior_strength: 0.2,
			seed: 2,
			mc_samples: 200,
		});
		for (let i = 1; i < result.days.length; i++) {
			expect(result.days[i].visitors_a).toBeGreaterThanOrEqual(result.days[i - 1].visitors_a);
			expect(result.days[i].visitors_b).toBeGreaterThanOrEqual(result.days[i - 1].visitors_b);
			expect(result.days[i].successes_a).toBeGreaterThanOrEqual(result.days[i - 1].successes_a);
			expect(result.days[i].successes_b).toBeGreaterThanOrEqual(result.days[i - 1].successes_b);
		}
	});

	it("cumulative visitors track visitors_per_day * day exactly", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.2,
			true_rate_b: 0.2,
			visitors_per_day: 33,
			days: 10,
			prior_strength: 0,
			seed: 3,
			mc_samples: 200,
		});
		result.days.forEach((d) => {
			expect(d.visitors_a).toBe(33 * d.day);
			expect(d.visitors_b).toBe(33 * d.day);
		});
	});

	it("computes a p-value and posterior probability from day 1 onward", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.5,
			true_rate_b: 0.5,
			visitors_per_day: 20,
			days: 5,
			prior_strength: 0,
			seed: 4,
			mc_samples: 200,
		});
		expect(result.days[0].posterior_prob_b_beats_a).not.toBeNull();
		expect(result.days[0].posterior_prob_b_beats_a).toBeGreaterThanOrEqual(0);
		expect(result.days[0].posterior_prob_b_beats_a).toBeLessThanOrEqual(1);
	});

	it("omits the credible interval when compute_credible_interval is false, but still computes P(B>A)", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.2,
			true_rate_b: 0.3,
			visitors_per_day: 50,
			days: 10,
			prior_strength: 0,
			seed: 5,
			mc_samples: 200,
			compute_credible_interval: false,
		});
		expect(result.days.every((d) => d.lift_ci_low === null && d.lift_ci_high === null)).toBe(true);
		expect(result.days.every((d) => d.posterior_prob_b_beats_a !== null)).toBe(true);
	});

	it("is deterministic for a fixed seed", () => {
		const config = { true_rate_a: 0.15, true_rate_b: 0.2, visitors_per_day: 30, days: 8, prior_strength: 0.1, seed: 99, mc_samples: 150 };
		const a = runSequentialExperiment(config);
		const b = runSequentialExperiment(config);
		expect(a.days).toEqual(b.days);
	});
});
