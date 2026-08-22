// Repeated-trials study: run the same raw-vs-CUPED comparison many times and tally two distinct
// things, kept deliberately separate rather than conflated into one "detection" number:
//
// - `*_final_day_detection_rate`: whether the FINAL day's p-value alone (a single, pre-committed
//   look, never an adaptive stopping rule) is significant. Under the null this must land near the
//   nominal alpha, exactly like The Peeking Problem's "checked once (end)" bar; using a first-
//   crossing search here instead would silently reintroduce that project's peeking inflation into
//   a page that isn't about peeking at all (caught by this file's own test suite, see cuped-study.test.ts).
// - `*_detection_days`: the day of first significance, a first-crossing search, meaningful and
//   reported ONLY under a genuine lift (the speed story this page is actually about), never used
//   to make any claim about false-positive rates.
import { runCupedExperiment } from "./cuped-experiment";

export interface CupedStudyConfig {
	trials: number;
	true_lift: number;
	y_mean: number;
	y_sd: number;
	correlation: number;
	visitors_per_day: number;
	days: number;
	alpha: number;
	seed: number;
}

export interface CupedStudyResult {
	raw_final_day_detection_rate: number;
	cuped_final_day_detection_rate: number;
	raw_detection_days: number[];
	cuped_detection_days: number[];
}

export function runCupedStudy(config: CupedStudyConfig): CupedStudyResult {
	let rawFinalDayDetections = 0;
	let cupedFinalDayDetections = 0;
	const rawDetectionDays: number[] = [];
	const cupedDetectionDays: number[] = [];

	for (let trial = 0; trial < config.trials; trial++) {
		const result = runCupedExperiment({
			true_lift: config.true_lift,
			y_mean: config.y_mean,
			y_sd: config.y_sd,
			correlation: config.correlation,
			visitors_per_day: config.visitors_per_day,
			days: config.days,
			seed: config.seed + trial,
		});

		const finalDay = result.days[result.days.length - 1];
		if (finalDay.raw_p_value !== null && finalDay.raw_p_value < config.alpha) rawFinalDayDetections++;
		if (finalDay.cuped_p_value !== null && finalDay.cuped_p_value < config.alpha) cupedFinalDayDetections++;

		const rawDay = result.days.find((d) => d.raw_p_value !== null && d.raw_p_value < config.alpha);
		const cupedDay = result.days.find((d) => d.cuped_p_value !== null && d.cuped_p_value < config.alpha);
		if (rawDay) rawDetectionDays.push(rawDay.day);
		if (cupedDay) cupedDetectionDays.push(cupedDay.day);
	}

	return {
		raw_final_day_detection_rate: rawFinalDayDetections / config.trials,
		cuped_final_day_detection_rate: cupedFinalDayDetections / config.trials,
		raw_detection_days: rawDetectionDays,
		cuped_detection_days: cupedDetectionDays,
	};
}
