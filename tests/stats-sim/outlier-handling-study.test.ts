import { describe, expect, it } from "vitest";
import { impliedFalsePositiveRate, runOutlierStudy, standardErrorCalibration, type OutlierStudyConfig } from "../../src/lib/stats-sim/outlier-handling-study";

const BASE_CONFIG: OutlierStudyConfig = {
	trials: 300,
	spend_rate: 0.3,
	mu: 3,
	sigma: 1.2,
	lift_mode: "none",
	true_relative_lift: 0,
	whale_fraction: 0.05,
	adjustment: "winsorize",
	upper_percentile: 0.99,
	visitors_per_day: 200,
	days: 20,
	alpha: 0.05,
	seed: 1,
};

describe("runOutlierStudy", () => {
	it("is deterministic for a fixed seed", () => {
		const a = runOutlierStudy({ ...BASE_CONFIG, trials: 50 });
		const b = runOutlierStudy({ ...BASE_CONFIG, trials: 50 });
		expect(a.raw_final_day_detection_rate).toBe(b.raw_final_day_detection_rate);
		expect(a.pooled_final_day_detection_rate).toBe(b.pooled_final_day_detection_rate);
		expect(a.stratified_final_day_detection_rate).toBe(b.stratified_final_day_detection_rate);
	});

	it("under no real difference, raw and pooled land near nominal alpha, but a self-estimated per-arm threshold inflates it", () => {
		// A real, surprising discovery from building this simulation, not an assumption: capping each
		// arm at its OWN independently-estimated percentile (stratified) systematically inflates the
		// false-positive rate above nominal, even though both arms are drawn from the identical
		// distribution under the null. Raw and pooled (one threshold estimated across both arms
		// combined) do not show this problem. This matches the real, published caution that
		// percentile thresholds must be pre-registered rather than estimated from the same data being
		// tested (see Methodology). Stratified's threshold is exactly that: estimated in-sample,
		// separately per arm, so each arm's own random extreme values feed back into how aggressively
		// that arm gets capped.
		const result = runOutlierStudy({ ...BASE_CONFIG, trials: 400, seed: 10 });
		expect(result.raw_final_day_detection_rate).toBeGreaterThan(0.02);
		expect(result.raw_final_day_detection_rate).toBeLessThan(0.09);
		expect(result.pooled_final_day_detection_rate).toBeGreaterThan(0.02);
		expect(result.pooled_final_day_detection_rate).toBeLessThan(0.09);
		expect(result.stratified_final_day_detection_rate).toBeGreaterThan(0.08);
	}, 15000);

	it("under a uniform lift, pooled and stratified both keep most of the true lift (above 60%)", () => {
		const result = runOutlierStudy({
			...BASE_CONFIG,
			lift_mode: "uniform",
			true_relative_lift: 0.3,
			trials: 200,
			seed: 20,
		});
		expect(result.pooled_avg_estimated_lift).toBeGreaterThan(result.true_dollar_lift * 0.6);
		expect(result.stratified_avg_estimated_lift).toBeGreaterThan(result.true_dollar_lift * 0.6);
	});

	it("under a tail-concentrated lift, pooled's average estimated lift is closer to zero than stratified's", () => {
		const result = runOutlierStudy({
			...BASE_CONFIG,
			lift_mode: "tail_concentrated",
			true_relative_lift: 0.3,
			whale_fraction: 0.05,
			upper_percentile: 0.95,
			trials: 200,
			seed: 30,
		});
		expect(result.pooled_avg_estimated_lift).toBeLessThan(result.stratified_avg_estimated_lift);
		expect(result.stratified_avg_estimated_lift).toBeGreaterThan(0);
	});

	it("measures the mechanism: stratified's own standard error understates how much its estimate really varies", () => {
		// The calibration ratio is the spread of the final-day difference across trials over the
		// standard error each trial reported. Honest error bars give about 1. The stratified
		// threshold's ratio sits well above that, which is what inflates its false-positive rate,
		// while the shared (pooled) threshold's noise moves both arms together and cancels.
		const result = runOutlierStudy({ ...BASE_CONFIG, trials: 400, seed: 10 });
		expect(result.raw_se_calibration).not.toBeNull();
		expect(result.raw_se_calibration as number).toBeGreaterThan(0.85);
		expect(result.raw_se_calibration as number).toBeLessThan(1.15);
		expect(result.pooled_se_calibration as number).toBeLessThan(1.15);
		expect(result.stratified_se_calibration as number).toBeGreaterThan(1.15);
		expect(result.stratified_se_calibration as number).toBeGreaterThan(result.pooled_se_calibration as number);
	}, 15000);
});

describe("standardErrorCalibration", () => {
	it("is 1 when the reported standard error matches the real spread", () => {
		// Estimates with sample SD exactly 1, each reporting a standard error of 1.
		const estimates = [-1, 1, -1, 1];
		const sd = Math.sqrt(4 / 3);
		expect(standardErrorCalibration(estimates, estimates.map(() => sd))).toBeCloseTo(1, 12);
	});

	it("exceeds 1 when the reported standard error is too small", () => {
		expect(standardErrorCalibration([-2, 2, -2, 2], [1, 1, 1, 1]) as number).toBeGreaterThan(1);
	});

	it("needs at least two trials and matching lengths", () => {
		expect(standardErrorCalibration([1], [1])).toBeNull();
		expect(standardErrorCalibration([1, 2], [1])).toBeNull();
	});
});

describe("impliedFalsePositiveRate", () => {
	it("is the nominal alpha when the standard error is honest", () => {
		expect(impliedFalsePositiveRate(1)).toBeCloseTo(0.05, 6);
		expect(impliedFalsePositiveRate(1, 0.01)).toBeCloseTo(0.01, 6);
	});

	it("grows as the reported standard error shrinks relative to the truth", () => {
		// Error bars 21% too narrow: P(|Z| > 1.96 / 1.21) is about 10.5%.
		expect(impliedFalsePositiveRate(1.21)).toBeCloseTo(0.105, 2);
		expect(impliedFalsePositiveRate(2)).toBeGreaterThan(impliedFalsePositiveRate(1.21));
	});

	it("rejects an alpha it has no critical value for", () => {
		expect(() => impliedFalsePositiveRate(1, 0.2)).toThrow();
	});
});
