// Repeated-trials study: run the same raw/pooled/stratified comparison many times and tally three
// distinct things, kept deliberately separate, the same discipline cuped-study.ts established:
//
// - `*_final_day_detection_rate`: whether the FINAL day's p-value alone (a single, pre-committed
//   look) is significant. Under lift_mode "none" this must land near the nominal alpha; using a
//   first-crossing search here instead would reintroduce the exact peeking inflation this page's
//   own CUPED study already got caught doing once (see cuped-study.ts and this page's NextSteps).
// - `*_detection_days`: the day of first significance, meaningful and reported only under a genuine
//   lift, never used for a false-positive-rate claim.
// - `*_avg_estimated_lift`: the average final-day (mean_b - mean_a) across trials, compared against
//   the calibrated `true_dollar_lift`. This is the number that shows the bias trade-off: under a
//   tail-concentrated lift, pooled winsorizing/trimming sits further from the true lift than
//   stratified does.
// - `*_se_calibration`: how much the estimated difference really varies across trials, divided by
//   the standard error each trial's own test reported. Near 1 means the test's error bars are
//   honest. Above 1 means the test understates its own uncertainty, which is exactly what inflates
//   a false-positive rate, so this measures the mechanism behind that inflation directly.
import { standardNormalCdf } from "./frequentist";
import { runOutlierExperiment, type OutlierAdjustment, type OutlierLiftMode } from "./outlier-handling-experiment";

export interface OutlierStudyConfig {
	trials: number;
	spend_rate: number;
	mu: number;
	sigma: number;
	lift_mode: OutlierLiftMode;
	true_relative_lift: number;
	whale_fraction: number;
	adjustment: OutlierAdjustment;
	upper_percentile: number;
	visitors_per_day: number;
	days: number;
	alpha: number;
	seed: number;
}

export interface OutlierStudyResult {
	raw_final_day_detection_rate: number;
	pooled_final_day_detection_rate: number;
	stratified_final_day_detection_rate: number;
	raw_detection_days: number[];
	pooled_detection_days: number[];
	stratified_detection_days: number[];
	raw_avg_estimated_lift: number;
	pooled_avg_estimated_lift: number;
	stratified_avg_estimated_lift: number;
	raw_se_calibration: number | null;
	pooled_se_calibration: number | null;
	stratified_se_calibration: number | null;
	true_dollar_lift: number;
}

/**
 * Spread of an estimator across repeated trials divided by the standard error the trials reported:
 * sample SD of the estimates over the root-mean-square of the reported standard errors. Null when
 * there are fewer than two trials to measure a spread from.
 */
export function standardErrorCalibration(estimates: number[], reportedSes: number[]): number | null {
	const n = estimates.length;
	if (n < 2 || reportedSes.length !== n) return null;
	const m = estimates.reduce((a, b) => a + b, 0) / n;
	const sd = Math.sqrt(estimates.reduce((acc, x) => acc + (x - m) ** 2, 0) / (n - 1));
	const rms = Math.sqrt(reportedSes.reduce((acc, se) => acc + se * se, 0) / n);
	return rms > 0 ? sd / rms : null;
}

/**
 * The false-positive rate a two-sided z-test should produce under a true null if its standard
 * error is too small by `calibration`. The real statistic is Normal with SD `calibration` on the
 * test's own scale, so it crosses the nominal critical value with probability
 * 2 * (1 - Phi(z_crit / calibration)). Comparing this prediction with the simulated rate checks
 * whether an understated standard error explains the whole inflation, or only part of it.
 */
export function impliedFalsePositiveRate(calibration: number, alpha = 0.05): number {
	const zCrit = alpha === 0.05 ? 1.959963984540054 : alpha === 0.01 ? 2.5758293035489004 : alpha === 0.1 ? 1.6448536269514722 : NaN;
	if (Number.isNaN(zCrit)) throw new Error(`unsupported alpha ${alpha}`);
	return 2 * (1 - standardNormalCdf(zCrit / calibration));
}

/** The standard error a day's test used, recovered from its 95% interval. */
function seFromInterval(low: number | null, high: number | null): number | null {
	return low === null || high === null ? null : (high - low) / (2 * 1.96);
}

export function runOutlierStudy(config: OutlierStudyConfig): OutlierStudyResult {
	let rawDetections = 0;
	let pooledDetections = 0;
	let stratifiedDetections = 0;
	const rawDetectionDays: number[] = [];
	const pooledDetectionDays: number[] = [];
	const stratifiedDetectionDays: number[] = [];
	let rawLiftSum = 0;
	let pooledLiftSum = 0;
	let stratifiedLiftSum = 0;
	let trueDollarLift = 0;
	const calibration = {
		raw: { est: [] as number[], se: [] as number[] },
		pooled: { est: [] as number[], se: [] as number[] },
		stratified: { est: [] as number[], se: [] as number[] },
	};

	for (let trial = 0; trial < config.trials; trial++) {
		const result = runOutlierExperiment({
			spend_rate: config.spend_rate,
			mu: config.mu,
			sigma: config.sigma,
			lift_mode: config.lift_mode,
			true_relative_lift: config.true_relative_lift,
			whale_fraction: config.whale_fraction,
			adjustment: config.adjustment,
			upper_percentile: config.upper_percentile,
			visitors_per_day: config.visitors_per_day,
			days: config.days,
			seed: config.seed + trial,
		});

		const finalDay = result.days[result.days.length - 1];
		trueDollarLift = finalDay.true_dollar_lift;

		if (finalDay.raw_p_value !== null && finalDay.raw_p_value < config.alpha) rawDetections++;
		if (finalDay.pooled_p_value !== null && finalDay.pooled_p_value < config.alpha) pooledDetections++;
		if (finalDay.stratified_p_value !== null && finalDay.stratified_p_value < config.alpha) stratifiedDetections++;

		const rawDay = result.days.find((d) => d.raw_p_value !== null && d.raw_p_value < config.alpha);
		const pooledDay = result.days.find((d) => d.pooled_p_value !== null && d.pooled_p_value < config.alpha);
		const stratifiedDay = result.days.find((d) => d.stratified_p_value !== null && d.stratified_p_value < config.alpha);
		if (rawDay) rawDetectionDays.push(rawDay.day);
		if (pooledDay) pooledDetectionDays.push(pooledDay.day);
		if (stratifiedDay) stratifiedDetectionDays.push(stratifiedDay.day);

		rawLiftSum += finalDay.raw_mean_b - finalDay.raw_mean_a;
		pooledLiftSum += finalDay.pooled_mean_b - finalDay.pooled_mean_a;
		stratifiedLiftSum += finalDay.stratified_mean_b - finalDay.stratified_mean_a;

		const record = (bucket: { est: number[]; se: number[] }, diff: number, low: number | null, high: number | null) => {
			const se = seFromInterval(low, high);
			if (se === null) return;
			bucket.est.push(diff);
			bucket.se.push(se);
		};
		record(calibration.raw, finalDay.raw_mean_b - finalDay.raw_mean_a, finalDay.raw_ci_low, finalDay.raw_ci_high);
		record(calibration.pooled, finalDay.pooled_mean_b - finalDay.pooled_mean_a, finalDay.pooled_ci_low, finalDay.pooled_ci_high);
		record(
			calibration.stratified,
			finalDay.stratified_mean_b - finalDay.stratified_mean_a,
			finalDay.stratified_ci_low,
			finalDay.stratified_ci_high,
		);
	}

	return {
		raw_final_day_detection_rate: rawDetections / config.trials,
		pooled_final_day_detection_rate: pooledDetections / config.trials,
		stratified_final_day_detection_rate: stratifiedDetections / config.trials,
		raw_detection_days: rawDetectionDays,
		pooled_detection_days: pooledDetectionDays,
		stratified_detection_days: stratifiedDetectionDays,
		raw_avg_estimated_lift: rawLiftSum / config.trials,
		pooled_avg_estimated_lift: pooledLiftSum / config.trials,
		stratified_avg_estimated_lift: stratifiedLiftSum / config.trials,
		raw_se_calibration: standardErrorCalibration(calibration.raw.est, calibration.raw.se),
		pooled_se_calibration: standardErrorCalibration(calibration.pooled.est, calibration.pooled.se),
		stratified_se_calibration: standardErrorCalibration(calibration.stratified.est, calibration.stratified.se),
		true_dollar_lift: trueDollarLift,
	};
}
