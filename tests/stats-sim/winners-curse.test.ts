import { describe, expect, it } from "vitest";
import { runMultiMetricStudy } from "../../src/lib/stats-sim/multi-metric-study";
import { CURSE_ALPHA, CURSE_CONFIG, measureWinnersCurse, RULES } from "../../src/lib/stats-sim/winners-curse";

// The numbers The Dashboard Problem's winner's-curse aside prints, pinned so a change to the
// simulation that moves them fails here before it quietly changes the page.
describe("measureWinnersCurse at the live experiment's defaults, seeds 1 to 3,000", () => {
	const result = measureWinnersCurse();

	it("runs the live experiment's defaults over seeds 1 to 3,000", () => {
		expect(CURSE_CONFIG).toEqual({ num_metrics: 20, fraction_null: 0.7, baseline_rate: 0.1, relative_lift: 0.6, visitors_per_arm: 400 });
		expect(CURSE_ALPHA).toBe(0.05);
		expect(result.first_seed).toBe(1);
		expect(result.last_seed).toBe(3000);
		expect(result.dashboards).toBe(3000);
		expect(result.lifted_metrics).toBe(3000 * 6);
		expect(result.zero_baseline_skipped).toBe(0);
	});

	it("pins the unselected yardstick: true +60%, observed +64% on average", () => {
		expect(result.true_lift).toBeCloseTo(0.6, 12);
		expect(result.mean_observed_lift_all).toBeCloseTo(0.6405, 4);
	});

	it("puts the unselected +4 points down to ratio bias: the plain rate difference lands on the truth", () => {
		// E[rate_b / rate_a] = p_b * E[1 / rate_a] > p_b / p_a. The first-order delta-method term,
		// (1 - p) / (n * p), predicts about +63.6%; the difference in rates has no such term.
		const p = CURSE_CONFIG.baseline_rate;
		const n = CURSE_CONFIG.visitors_per_arm;
		const deltaMethod = (1 + result.true_lift) * (1 + (1 - p) / (n * p)) - 1;
		expect(result.mean_observed_lift_all).toBeGreaterThan(deltaMethod - 0.005);
		expect(result.mean_observed_lift_all).toBeLessThan(deltaMethod + 0.01);
		expect(result.true_diff).toBeCloseTo(0.06, 12);
		expect(result.mean_observed_diff_all).toBeCloseTo(0.0602, 4);
		expect(Math.abs(result.mean_observed_diff_all - result.true_diff)).toBeLessThan(0.001);
	});

	it("pins each rule's flag counts and null share", () => {
		expect(result.rules.none).toMatchObject({ flags: 14998, null_flags: 2076, lifted_flags: 12922 });
		expect(result.rules.bh).toMatchObject({ flags: 8700, null_flags: 438, lifted_flags: 8262 });
		expect(result.rules.bonferroni).toMatchObject({ flags: 5707, null_flags: 111, lifted_flags: 5596 });
		// No correction: 13.8% of flags are null, the page's "around one in eight".
		expect(result.rules.none.null_share).toBeCloseTo(0.1384, 4);
		expect(result.rules.bh.null_share).toBeCloseTo(0.0503, 4);
		expect(result.rules.bonferroni.null_share).toBeCloseTo(0.0194, 4);
	});

	it("pins each rule's average observed lift among the real winners it flagged", () => {
		expect(result.rules.none.mean_observed_lift).toBeCloseTo(0.7782, 4);
		expect(result.rules.bh.mean_observed_lift).toBeCloseTo(0.9083, 4);
		expect(result.rules.bonferroni.mean_observed_lift).toBeCloseTo(1.0117, 4);
	});

	it("a stricter bar cuts false flags and worsens the curse, on both scales", () => {
		for (let i = 1; i < RULES.length; i++) {
			const looser = result.rules[RULES[i - 1]];
			const stricter = result.rules[RULES[i]];
			expect(stricter.null_share).toBeLessThan(looser.null_share);
			expect(stricter.mean_observed_lift).toBeGreaterThan(looser.mean_observed_lift);
			expect(stricter.mean_observed_diff).toBeGreaterThan(looser.mean_observed_diff);
		}
		expect(result.rules.none.mean_observed_lift).toBeGreaterThan(result.mean_observed_lift_all);
		expect(result.rules.none.mean_observed_diff).toBeGreaterThan(result.mean_observed_diff_all);
	});

	it("agrees with the metric-count study's power over the same 3,000 seeds", () => {
		const study = runMultiMetricStudy({ ...CURSE_CONFIG, alpha: CURSE_ALPHA, trials: 3000, seed: 1 });
		expect(result.rules.none.lifted_flags / result.lifted_metrics).toBeCloseTo(study.naive_power, 12);
		expect(result.rules.bh.lifted_flags / result.lifted_metrics).toBeCloseTo(study.bh_power, 12);
		expect(result.rules.bonferroni.lifted_flags / result.lifted_metrics).toBeCloseTo(study.bonferroni_power, 12);
	});

	it("is deterministic for a fixed seed range", () => {
		expect(measureWinnersCurse(5, 40)).toEqual(measureWinnersCurse(5, 40));
	});

	it("rejects an empty seed range", () => {
		expect(() => measureWinnersCurse(10, 9)).toThrow();
	});
});
