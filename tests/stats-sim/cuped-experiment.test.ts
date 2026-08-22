import { describe, expect, it } from "vitest";
import { runCupedExperiment, type CupedExperimentConfig } from "../../src/lib/stats-sim/cuped-experiment";

const BASE_CONFIG: CupedExperimentConfig = {
	true_lift: 0,
	y_mean: 100,
	y_sd: 20,
	correlation: 0.6,
	visitors_per_day: 200,
	days: 20,
	seed: 1,
};

describe("runCupedExperiment", () => {
	it("is deterministic for a fixed seed", () => {
		const a = runCupedExperiment(BASE_CONFIG);
		const b = runCupedExperiment(BASE_CONFIG);
		expect(a.days[a.days.length - 1].raw_p_value).toBe(b.days[b.days.length - 1].raw_p_value);
		expect(a.days[a.days.length - 1].cuped_p_value).toBe(b.days[b.days.length - 1].cuped_p_value);
	});

	it("the CUPED-adjusted CI is narrower than the raw CI once correlation is meaningful", () => {
		const result = runCupedExperiment({ ...BASE_CONFIG, correlation: 0.8, seed: 3 });
		const finalDay = result.days[result.days.length - 1];
		const rawWidth = finalDay.raw_ci_high! - finalDay.raw_ci_low!;
		const cupedWidth = finalDay.cuped_ci_high! - finalDay.cuped_ci_low!;
		expect(cupedWidth).toBeLessThan(rawWidth);
	});

	it("both raw and CUPED final-day false-positive rates land near the nominal 5% under the null", () => {
		const alpha = 0.05;
		let rawFalsePositives = 0;
		let cupedFalsePositives = 0;
		const trials = 400;
		for (let trial = 0; trial < trials; trial++) {
			const result = runCupedExperiment({ ...BASE_CONFIG, correlation: 0.7, seed: 1000 + trial });
			const finalDay = result.days[result.days.length - 1];
			if (finalDay.raw_p_value !== null && finalDay.raw_p_value < alpha) rawFalsePositives++;
			if (finalDay.cuped_p_value !== null && finalDay.cuped_p_value < alpha) cupedFalsePositives++;
		}
		const rawRate = rawFalsePositives / trials;
		const cupedRate = cupedFalsePositives / trials;
		expect(rawRate).toBeGreaterThan(0.02);
		expect(rawRate).toBeLessThan(0.09);
		expect(cupedRate).toBeGreaterThan(0.02);
		expect(cupedRate).toBeLessThan(0.09);
	});

	it("under a genuine, modest lift, CUPED detects it far more often than raw within the same window", () => {
		// A deliberately modest-power scenario (small daily traffic, a lift that isn't a slam dunk):
		// tuned by actually running the simulation first (not guessed) to land raw's detection rate
		// well short of certain, so the comparison is meaningful rather than both saturating at ~100%.
		const trials = 200;
		let rawDetections = 0;
		let cupedDetections = 0;
		for (let trial = 0; trial < trials; trial++) {
			const result = runCupedExperiment({
				true_lift: 4,
				y_mean: 100,
				y_sd: 20,
				correlation: 0.85,
				visitors_per_day: 30,
				days: 10,
				seed: 5000 + trial,
			});
			const finalDay = result.days[result.days.length - 1];
			if (finalDay.raw_p_value !== null && finalDay.raw_p_value < 0.05) rawDetections++;
			if (finalDay.cuped_p_value !== null && finalDay.cuped_p_value < 0.05) cupedDetections++;
		}
		expect(rawDetections / trials).toBeGreaterThan(0.5);
		expect(rawDetections / trials).toBeLessThan(0.85);
		expect(cupedDetections).toBeGreaterThan(rawDetections);
		expect(cupedDetections / trials).toBeGreaterThan(0.9);
	});

	it("under the same genuine lift, CUPED's average day of first detection is earlier than raw's", () => {
		const trials = 200;
		let rawDaySum = 0;
		let cupedDaySum = 0;
		let rawDetections = 0;
		let cupedDetections = 0;
		for (let trial = 0; trial < trials; trial++) {
			const result = runCupedExperiment({
				true_lift: 4,
				y_mean: 100,
				y_sd: 20,
				correlation: 0.85,
				visitors_per_day: 30,
				days: 30,
				seed: 7000 + trial,
			});
			const rawDay = result.days.find((d) => d.raw_p_value !== null && d.raw_p_value < 0.05);
			const cupedDay = result.days.find((d) => d.cuped_p_value !== null && d.cuped_p_value < 0.05);
			if (rawDay) {
				rawDaySum += rawDay.day;
				rawDetections++;
			}
			if (cupedDay) {
				cupedDaySum += cupedDay.day;
				cupedDetections++;
			}
		}
		expect(cupedDaySum / cupedDetections).toBeLessThan(rawDaySum / rawDetections);
	});
});
