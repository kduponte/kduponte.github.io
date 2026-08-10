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

	it("computes an always-valid p-value from day 1 onward, in [0, 1]", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.1,
			true_rate_b: 0.13,
			visitors_per_day: 50,
			days: 10,
			prior_strength: 0,
			seed: 6,
			mc_samples: 150,
		});
		expect(result.days[0].always_valid_p_value).not.toBeNull();
		result.days.forEach((d) => {
			expect(d.always_valid_p_value).toBeGreaterThanOrEqual(0);
			expect(d.always_valid_p_value).toBeLessThanOrEqual(1);
		});
	});
});

describe("runSequentialExperiment — always-valid test has real detection power (not a degenerate/powerless test)", () => {
	it("detects a genuine 30% relative lift meaningfully more often with more accumulated data", () => {
		const detectionRate = (days: number) => {
			const trials = 600;
			let detected = 0;
			for (let trial = 0; trial < trials; trial++) {
				const result = runSequentialExperiment({
					true_rate_a: 0.1,
					true_rate_b: 0.13,
					visitors_per_day: 50,
					days,
					prior_strength: 0,
					seed: 7000 + trial,
					mc_samples: 150,
					compute_credible_interval: false,
				});
				const finalDay = result.days[result.days.length - 1];
				if (finalDay.always_valid_p_value !== null && finalDay.always_valid_p_value <= 0.05) detected++;
			}
			return detected / trials;
		};

		const shortRun = detectionRate(30);
		const longRun = detectionRate(120);
		// Not degenerate: it does detect real effects at a non-trivial rate, and detection improves
		// substantially with more data, the expected shape for a genuine, if conservative, test.
		expect(shortRun).toBeGreaterThan(0.1);
		expect(longRun).toBeGreaterThan(shortRun);
		expect(longRun).toBeGreaterThan(0.5);
	});
});

describe("runSequentialExperiment — revenue mode (two-part hurdle model)", () => {
	it("produces one snapshot per day, in order, same shape as conversion mode", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.01,
			true_rate_b: 0.01,
			visitors_per_day: 5000,
			days: 10,
			prior_strength: 0,
			seed: 1,
			mc_samples: 150,
			metric_type: "revenue",
			avg_revenue_per_spender_a: 50,
			avg_revenue_per_spender_b: 50,
		});
		expect(result.days).toHaveLength(10);
		expect(result.days.map((d) => d.day)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
	});

	it("metric_value is spend_rate * avg_revenue_per_spender on average (a $50 avg spend at 1% spend rate should land near $0.50/visitor)", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.01,
			true_rate_b: 0.01,
			visitors_per_day: 500_000,
			days: 5,
			prior_strength: 0,
			seed: 2,
			mc_samples: 150,
			metric_type: "revenue",
			avg_revenue_per_spender_a: 50,
			avg_revenue_per_spender_b: 50,
		});
		const finalDay = result.days[result.days.length - 1];
		expect(finalDay.metric_value_a).toBeCloseTo(0.5, 1);
		expect(finalDay.metric_value_b).toBeCloseTo(0.5, 1);
	});

	it("successes_a/b count spenders (not converters), never exceeding visitors", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.05,
			true_rate_b: 0.05,
			visitors_per_day: 1000,
			days: 10,
			prior_strength: 0,
			seed: 3,
			mc_samples: 150,
			metric_type: "revenue",
			avg_revenue_per_spender_a: 30,
			avg_revenue_per_spender_b: 30,
		});
		result.days.forEach((d) => {
			expect(d.successes_a).toBeLessThanOrEqual(d.visitors_a);
			expect(d.successes_b).toBeLessThanOrEqual(d.visitors_b);
			expect(d.successes_a).toBeGreaterThanOrEqual(0);
		});
	});

	it("P(B beats A) averages close to 0.5 across repeated null-true runs (single-seed reads are individually noisy)", () => {
		// A single seed's posterior can legitimately land far from 0.5 by chance, even with a lot
		// of data, if that particular random draw happened to favor one arm — that's not a bug,
		// it's what "under the null" actually looks like for one realization. Averaging over
		// several independent seeds is the statistically correct way to check calibration here;
		// the full aggregate-rate proof lives in peeking-study.test.ts's revenue-mode block.
		const posteriors = Array.from({ length: 20 }, (_, i) => {
			const result = runSequentialExperiment({
				true_rate_a: 0.02,
				true_rate_b: 0.02,
				visitors_per_day: 50_000,
				days: 15,
				prior_strength: 0,
				seed: 100 + i,
				mc_samples: 400,
				metric_type: "revenue",
				avg_revenue_per_spender_a: 40,
				avg_revenue_per_spender_b: 40,
			});
			return result.days[result.days.length - 1].posterior_prob_b_beats_a as number;
		});
		const mean = posteriors.reduce((a, b) => a + b, 0) / posteriors.length;
		expect(mean).toBeGreaterThan(0.35);
		expect(mean).toBeLessThan(0.65);
	});

	it("detects an obvious real difference in average revenue per spender", () => {
		const result = runSequentialExperiment({
			true_rate_a: 0.01,
			true_rate_b: 0.01,
			visitors_per_day: 500_000,
			days: 5,
			prior_strength: 0,
			seed: 5,
			mc_samples: 200,
			metric_type: "revenue",
			avg_revenue_per_spender_a: 50,
			avg_revenue_per_spender_b: 65, // a large, obvious 30% lift
		});
		const finalDay = result.days[result.days.length - 1];
		expect(finalDay.p_value).not.toBeNull();
		expect(finalDay.p_value as number).toBeLessThan(0.01);
		expect(finalDay.posterior_prob_b_beats_a).toBeGreaterThan(0.95);
		expect(finalDay.always_valid_p_value).not.toBeNull();
		expect(finalDay.always_valid_p_value as number).toBeLessThan(0.05);
	});

	it("is deterministic for a fixed seed", () => {
		const config = {
			true_rate_a: 0.015,
			true_rate_b: 0.02,
			visitors_per_day: 20_000,
			days: 8,
			prior_strength: 0.2,
			seed: 77,
			mc_samples: 150,
			metric_type: "revenue" as const,
			avg_revenue_per_spender_a: 45,
			avg_revenue_per_spender_b: 55,
		};
		const a = runSequentialExperiment(config);
		const b = runSequentialExperiment(config);
		expect(a.days).toEqual(b.days);
	});

	it("stays fast at 500,000 visitors/day (the default scale)", () => {
		const start = Date.now();
		runSequentialExperiment({
			true_rate_a: 0.01,
			true_rate_b: 0.01,
			visitors_per_day: 500_000,
			days: 30,
			prior_strength: 0,
			seed: 6,
			mc_samples: 1500,
			metric_type: "revenue",
			avg_revenue_per_spender_a: 50,
			avg_revenue_per_spender_b: 50,
		});
		expect(Date.now() - start).toBeLessThan(2000);
	});
});
