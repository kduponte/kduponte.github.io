import { describe, expect, it } from "vitest";
import { runCupedStudy } from "../../src/lib/stats-sim/cuped-study";

describe("runCupedStudy", () => {
	it("under the null, both raw and CUPED detection rates land near the nominal alpha", () => {
		const result = runCupedStudy({
			trials: 400,
			true_lift: 0,
			y_mean: 100,
			y_sd: 20,
			correlation: 0.75,
			visitors_per_day: 30,
			days: 20,
			alpha: 0.05,
			seed: 1,
		});
		expect(result.raw_final_day_detection_rate).toBeGreaterThan(0.02);
		expect(result.raw_final_day_detection_rate).toBeLessThan(0.09);
		expect(result.cuped_final_day_detection_rate).toBeGreaterThan(0.02);
		expect(result.cuped_final_day_detection_rate).toBeLessThan(0.09);
	});

	it("under a genuine modest lift, CUPED detects meaningfully more often (by the final day) and sooner (first-crossing) than raw", () => {
		const result = runCupedStudy({
			trials: 300,
			true_lift: 4,
			y_mean: 100,
			y_sd: 20,
			correlation: 0.85,
			visitors_per_day: 30,
			days: 10,
			alpha: 0.05,
			seed: 5000,
		});
		expect(result.cuped_final_day_detection_rate).toBeGreaterThan(result.raw_final_day_detection_rate);
		const avgRawDay = result.raw_detection_days.reduce((s, d) => s + d, 0) / result.raw_detection_days.length;
		const avgCupedDay = result.cuped_detection_days.reduce((s, d) => s + d, 0) / result.cuped_detection_days.length;
		expect(avgCupedDay).toBeLessThan(avgRawDay);
	});

	it("is deterministic for a fixed seed", () => {
		const config = { trials: 50, true_lift: 3, y_mean: 100, y_sd: 20, correlation: 0.6, visitors_per_day: 30, days: 15, alpha: 0.05, seed: 42 };
		const a = runCupedStudy(config);
		const b = runCupedStudy(config);
		expect(a.raw_final_day_detection_rate).toBe(b.raw_final_day_detection_rate);
		expect(a.cuped_final_day_detection_rate).toBe(b.cuped_final_day_detection_rate);
	});
});
