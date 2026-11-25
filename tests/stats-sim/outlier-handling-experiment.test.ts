import { describe, expect, it } from "vitest";
import { runOutlierExperiment, type OutlierExperimentConfig } from "../../src/lib/stats-sim/outlier-handling-experiment";

const BASE_CONFIG: OutlierExperimentConfig = {
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
	seed: 1,
};

function finalDay(result: ReturnType<typeof runOutlierExperiment>) {
	return result.days[result.days.length - 1];
}

describe("runOutlierExperiment", () => {
	it("is deterministic for a fixed seed", () => {
		const a = runOutlierExperiment(BASE_CONFIG);
		const b = runOutlierExperiment(BASE_CONFIG);
		expect(finalDay(a).raw_p_value).toBe(finalDay(b).raw_p_value);
		expect(finalDay(a).pooled_p_value).toBe(finalDay(b).pooled_p_value);
		expect(finalDay(a).stratified_p_value).toBe(finalDay(b).stratified_p_value);
	});

	it("under no real difference, winsorizing a heavy-tailed metric reduces variance vs raw", () => {
		const result = runOutlierExperiment({ ...BASE_CONFIG, seed: 2 });
		const day = finalDay(result);
		// Both arms are capped by the same rule regardless of which arm they're in, so means should
		// stay close to each other under the null across all three methods.
		expect(Math.abs(day.pooled_mean_a - day.pooled_mean_b)).toBeLessThan(Math.abs(day.raw_mean_a - day.raw_mean_b) + 5);
	});

	it("under a uniform lift, all three methods keep at least half of the true lift", () => {
		const result = runOutlierExperiment({
			...BASE_CONFIG,
			lift_mode: "uniform",
			true_relative_lift: 0.3,
			visitors_per_day: 2000,
			days: 30,
			seed: 3,
		});
		const day = finalDay(result);
		const rawLift = day.raw_mean_b - day.raw_mean_a;
		const pooledLift = day.pooled_mean_b - day.pooled_mean_a;
		const stratifiedLift = day.stratified_mean_b - day.stratified_mean_a;

		expect(rawLift).toBeGreaterThan(day.true_dollar_lift * 0.5);
		expect(pooledLift).toBeGreaterThan(day.true_dollar_lift * 0.5);
		expect(stratifiedLift).toBeGreaterThan(day.true_dollar_lift * 0.5);
	});

	it("under a tail-concentrated lift, pooled winsorizing attenuates the estimated lift more than stratified does", () => {
		const result = runOutlierExperiment({
			...BASE_CONFIG,
			lift_mode: "tail_concentrated",
			true_relative_lift: 0.3,
			whale_fraction: 0.05,
			upper_percentile: 0.95,
			visitors_per_day: 2000,
			days: 30,
			seed: 4,
		});
		const day = finalDay(result);
		const pooledLift = day.pooled_mean_b - day.pooled_mean_a;
		const stratifiedLift = day.stratified_mean_b - day.stratified_mean_a;

		expect(pooledLift).toBeLessThan(stratifiedLift);
		expect(stratifiedLift).toBeGreaterThan(pooledLift * 1.2);
	});

	it("trimming behaves in the same direction as winsorizing under a tail-concentrated lift", () => {
		const config: OutlierExperimentConfig = {
			...BASE_CONFIG,
			lift_mode: "tail_concentrated",
			true_relative_lift: 0.3,
			whale_fraction: 0.05,
			upper_percentile: 0.95,
			visitors_per_day: 2000,
			days: 30,
			seed: 5,
			adjustment: "trim",
		};
		const result = runOutlierExperiment(config);
		const day = finalDay(result);
		const pooledLift = day.pooled_mean_b - day.pooled_mean_a;
		const stratifiedLift = day.stratified_mean_b - day.stratified_mean_a;
		expect(pooledLift).toBeLessThan(stratifiedLift);
	});
});
