// Runs many repeated null-true trials (true_rate_a === true_rate_b, i.e. no real difference) and
// measures how often each method would have declared a "winner" at some point during monitoring
// vs. only at a fixed final look. This is what makes the optional-stopping problem visible with
// real numbers instead of asserting it — see the published page's Methodology section.
//
// The Bayesian decision rule is two-sided (P(B>A) crosses the threshold in EITHER direction), to
// match the frequentist test being two-sided — otherwise the comparison wouldn't be apples-to-apples.
import { runSequentialExperiment } from "./sequential-experiment";
import type { PeekingStudyConfig, PeekingStudyResult } from "./types";

function bayesianCrossed(probBBeatsA: number | null, threshold: number): boolean {
	return probBBeatsA !== null && (probBBeatsA > threshold || probBBeatsA < 1 - threshold);
}

export function runPeekingStudy(config: PeekingStudyConfig): PeekingStudyResult {
	let freqAnyDay = 0;
	let freqFinalDay = 0;
	let bayesAnyDay = 0;
	let bayesFinalDay = 0;
	let alwaysValidAnyDay = 0;
	let alwaysValidFinalDay = 0;
	const firstCrossingDaysFrequentist: number[] = [];
	const firstCrossingDaysBayesian: number[] = [];
	const firstCrossingDaysAlwaysValid: number[] = [];

	for (let trial = 0; trial < config.trials; trial++) {
		const result = runSequentialExperiment({
			true_rate_a: config.true_rate,
			true_rate_b: config.true_rate,
			visitors_per_day: config.visitors_per_day,
			days: config.days,
			prior_strength: config.prior_strength,
			seed: config.seed + trial, // distinct, reproducible seed per trial
			mc_samples: config.mc_samples,
			compute_credible_interval: false, // not needed for threshold-crossing bookkeeping
			always_valid_relative_effect_size: config.always_valid_relative_effect_size,
			metric_type: config.metric_type,
			avg_revenue_per_spender_a: config.avg_revenue_per_spender,
			avg_revenue_per_spender_b: config.avg_revenue_per_spender, // both arms share the same baseline under the null
			revenue_sigma: config.revenue_sigma,
		});

		let freqCrossedAnyDay = false;
		let bayesCrossedAnyDay = false;
		let alwaysValidCrossedAnyDay = false;
		for (const snapshot of result.days) {
			if (!freqCrossedAnyDay && snapshot.p_value !== null && snapshot.p_value < config.frequentist_alpha) {
				freqCrossedAnyDay = true;
				firstCrossingDaysFrequentist.push(snapshot.day);
			}
			if (!bayesCrossedAnyDay && bayesianCrossed(snapshot.posterior_prob_b_beats_a, config.bayesian_threshold)) {
				bayesCrossedAnyDay = true;
				firstCrossingDaysBayesian.push(snapshot.day);
			}
			if (!alwaysValidCrossedAnyDay && snapshot.always_valid_p_value !== null && snapshot.always_valid_p_value <= config.frequentist_alpha) {
				alwaysValidCrossedAnyDay = true;
				firstCrossingDaysAlwaysValid.push(snapshot.day);
			}
		}
		if (freqCrossedAnyDay) freqAnyDay++;
		if (bayesCrossedAnyDay) bayesAnyDay++;
		if (alwaysValidCrossedAnyDay) alwaysValidAnyDay++;

		const finalDay = result.days[result.days.length - 1];
		if (finalDay.p_value !== null && finalDay.p_value < config.frequentist_alpha) freqFinalDay++;
		if (bayesianCrossed(finalDay.posterior_prob_b_beats_a, config.bayesian_threshold)) bayesFinalDay++;
		if (finalDay.always_valid_p_value !== null && finalDay.always_valid_p_value <= config.frequentist_alpha) alwaysValidFinalDay++;
	}

	return {
		config,
		frequentist_any_day_rate: freqAnyDay / config.trials,
		frequentist_final_day_rate: freqFinalDay / config.trials,
		bayesian_any_day_rate: bayesAnyDay / config.trials,
		bayesian_final_day_rate: bayesFinalDay / config.trials,
		always_valid_any_day_rate: alwaysValidAnyDay / config.trials,
		always_valid_final_day_rate: alwaysValidFinalDay / config.trials,
		first_crossing_days_frequentist: firstCrossingDaysFrequentist,
		first_crossing_days_bayesian: firstCrossingDaysBayesian,
		first_crossing_days_always_valid: firstCrossingDaysAlwaysValid,
	};
}
