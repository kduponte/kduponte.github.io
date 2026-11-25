// Day-by-day simulation of a two-arm experiment on a heavy-tailed hurdle-model revenue metric, run
// three ways in parallel on identical underlying data: raw, pooled-threshold winsorized/trimmed (one
// shared cutoff computed across both arms combined), and stratified-threshold winsorized/trimmed
// (each arm capped by its own cutoff). Unlike CUPED's plain correlated-normal pair (cuped.ts), a
// metric worth winsorizing needs real skew, hence the hurdle/log-normal generator from
// outlier-handling.ts / revenue.ts rather than a normal distribution.
import { hurdleMeanAndVariance, twoSampleZTestOnMeans } from "./revenue";
import {
	computeWhaleLiftMultiplier,
	percentileThreshold,
	sampleArmBRevenueTailConcentrated,
	sampleArmBRevenueUniform,
	sampleHurdleRevenue,
	trimValues,
	winsorizeValues,
} from "./outlier-handling";
import { mulberry32 } from "./rng";

export type OutlierLiftMode = "none" | "uniform" | "tail_concentrated";
export type OutlierAdjustment = "winsorize" | "trim";

export interface OutlierExperimentConfig {
	spend_rate: number;
	mu: number;
	sigma: number;
	lift_mode: OutlierLiftMode;
	true_relative_lift: number; // unused when lift_mode === "none"
	whale_fraction: number; // unused unless lift_mode === "tail_concentrated"
	adjustment: OutlierAdjustment;
	upper_percentile: number; // e.g. 0.99
	visitors_per_day: number;
	days: number;
	seed: number;
}

export interface OutlierDaySnapshot {
	day: number;
	raw_mean_a: number;
	raw_mean_b: number;
	raw_p_value: number | null;
	raw_ci_low: number | null;
	raw_ci_high: number | null;
	pooled_mean_a: number;
	pooled_mean_b: number;
	pooled_p_value: number | null;
	pooled_ci_low: number | null;
	pooled_ci_high: number | null;
	stratified_mean_a: number;
	stratified_mean_b: number;
	stratified_p_value: number | null;
	stratified_ci_low: number | null;
	stratified_ci_high: number | null;
	true_dollar_lift: number;
}

export interface OutlierExperimentResult {
	days: OutlierDaySnapshot[];
}

function mean(values: number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleVariance(values: number[], m: number): number {
	if (values.length < 2) return 0;
	const sumSq = values.reduce((sum, v) => sum + (v - m) * (v - m), 0);
	return sumSq / (values.length - 1);
}

function confidenceInterval(meanDiff: number, seFromTest: number): { low: number; high: number } {
	return { low: meanDiff - 1.96 * seFromTest, high: meanDiff + 1.96 * seFromTest };
}

interface ArmStats {
	mean: number;
	variance: number;
	n: number;
}

function armStats(values: number[]): ArmStats {
	const m = mean(values);
	return { mean: m, variance: sampleVariance(values, m), n: values.length };
}

function runTest(a: ArmStats, b: ArmStats) {
	const test = twoSampleZTestOnMeans(a.mean, a.variance, a.n, b.mean, b.variance, b.n);
	const se = Math.sqrt(a.variance / a.n + b.variance / b.n);
	const ci = test.p_value !== null ? confidenceInterval(b.mean - a.mean, se) : null;
	return { test, ci };
}

export function runOutlierExperiment(config: OutlierExperimentConfig): OutlierExperimentResult {
	const rng = mulberry32(config.seed);
	const rawA: number[] = [];
	const rawB: number[] = [];
	const days: OutlierDaySnapshot[] = [];

	const whaleMultiplier =
		config.lift_mode === "tail_concentrated"
			? computeWhaleLiftMultiplier(config.spend_rate, config.mu, config.sigma, config.true_relative_lift, config.whale_fraction)
			: 1;

	const trueDollarLift =
		config.lift_mode === "none" ? 0 : config.true_relative_lift * hurdleMeanAndVariance(config.spend_rate, config.mu, config.sigma).mean;

	const adjust = config.adjustment === "winsorize" ? winsorizeValues : trimValues;

	for (let day = 1; day <= config.days; day++) {
		for (let i = 0; i < config.visitors_per_day; i++) {
			rawA.push(sampleHurdleRevenue(config.spend_rate, config.mu, config.sigma, rng));
			if (config.lift_mode === "none") {
				rawB.push(sampleHurdleRevenue(config.spend_rate, config.mu, config.sigma, rng));
			} else if (config.lift_mode === "uniform") {
				rawB.push(sampleArmBRevenueUniform(config.spend_rate, config.mu, config.sigma, config.true_relative_lift, rng));
			} else {
				rawB.push(sampleArmBRevenueTailConcentrated(config.spend_rate, config.mu, config.sigma, config.whale_fraction, whaleMultiplier, rng));
			}
		}

		const rawArmA = armStats(rawA);
		const rawArmB = armStats(rawB);
		const raw = runTest(rawArmA, rawArmB);

		const pooledThreshold = percentileThreshold(rawA.concat(rawB), config.upper_percentile);
		const pooledA = armStats(adjust(rawA, pooledThreshold));
		const pooledB = armStats(adjust(rawB, pooledThreshold));
		const pooled = runTest(pooledA, pooledB);

		const thresholdA = percentileThreshold(rawA, config.upper_percentile);
		const thresholdB = percentileThreshold(rawB, config.upper_percentile);
		const stratifiedA = armStats(adjust(rawA, thresholdA));
		const stratifiedB = armStats(adjust(rawB, thresholdB));
		const stratified = runTest(stratifiedA, stratifiedB);

		days.push({
			day,
			raw_mean_a: rawArmA.mean,
			raw_mean_b: rawArmB.mean,
			raw_p_value: raw.test.p_value,
			raw_ci_low: raw.ci?.low ?? null,
			raw_ci_high: raw.ci?.high ?? null,
			pooled_mean_a: pooledA.mean,
			pooled_mean_b: pooledB.mean,
			pooled_p_value: pooled.test.p_value,
			pooled_ci_low: pooled.ci?.low ?? null,
			pooled_ci_high: pooled.ci?.high ?? null,
			stratified_mean_a: stratifiedA.mean,
			stratified_mean_b: stratifiedB.mean,
			stratified_p_value: stratified.test.p_value,
			stratified_ci_low: stratified.ci?.low ?? null,
			stratified_ci_high: stratified.ci?.high ?? null,
			true_dollar_lift: trueDollarLift,
		});
	}

	return { days };
}
