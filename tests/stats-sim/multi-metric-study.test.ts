import { describe, expect, it } from "vitest";
import { runMultiMetricStudy } from "../../src/lib/stats-sim/multi-metric-study";

describe("runMultiMetricStudy", () => {
	it("under all-true-null, naive FWER matches 1-(1-alpha)^m and Bonferroni/BH stay controlled", () => {
		const alpha = 0.05;
		const numMetrics = 20;
		const result = runMultiMetricStudy({
			trials: 1500,
			num_metrics: numMetrics,
			fraction_null: 1,
			baseline_rate: 0.1,
			relative_lift: 0,
			visitors_per_arm: 500,
			alpha,
			seed: 1,
		});
		const expectedNaiveFwer = 1 - Math.pow(1 - alpha, numMetrics);
		expect(result.naive_fwer).toBeCloseTo(expectedNaiveFwer, 1);
		expect(result.bonferroni_fwer).toBeGreaterThan(0.01);
		expect(result.bonferroni_fwer).toBeLessThan(0.09);
		expect(result.bh_fwer).toBeLessThan(result.naive_fwer);
	});

	it("under a mix of null and lifted metrics, BH detects more true effects than Bonferroni, with FDR still controlled", () => {
		const result = runMultiMetricStudy({
			trials: 800,
			num_metrics: 20,
			fraction_null: 0.7,
			baseline_rate: 0.1,
			relative_lift: 0.6,
			visitors_per_arm: 400,
			alpha: 0.05,
			seed: 42,
		});
		expect(result.bh_power).toBeGreaterThan(result.bonferroni_power);
		expect(result.bh_fdr).toBeLessThanOrEqual(0.07);
		expect(result.bonferroni_fdr).toBeLessThanOrEqual(0.07);
	});

	it("naive detects the most true effects but at an uncontrolled false discovery rate", () => {
		const result = runMultiMetricStudy({
			trials: 800,
			num_metrics: 20,
			fraction_null: 0.7,
			baseline_rate: 0.1,
			relative_lift: 0.6,
			visitors_per_arm: 400,
			alpha: 0.05,
			seed: 43,
		});
		expect(result.naive_power).toBeGreaterThanOrEqual(result.bh_power);
		expect(result.naive_fdr).toBeGreaterThan(result.bh_fdr);
	});

	it("is deterministic for a fixed seed", () => {
		const config = {
			trials: 100,
			num_metrics: 10,
			fraction_null: 0.5,
			baseline_rate: 0.1,
			relative_lift: 0.5,
			visitors_per_arm: 300,
			alpha: 0.05,
			seed: 5,
		};
		const a = runMultiMetricStudy(config);
		const b = runMultiMetricStudy(config);
		expect(a).toEqual(b);
	});
});
