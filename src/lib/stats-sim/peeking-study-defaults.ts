// The Peeking Problem's repeated-trials study settings, in one place so the study chart and the
// hero's p-value coaster can't drift apart. The study opens on revenue per user at production
// traffic; the conversion-rate defaults are what its metric switch falls back to.
import type { PeekingStudyConfig } from "./types";

export const STUDY_DAYS = 30;
export const STUDY_TRIALS = 500;
export const STUDY_FREQUENTIST_ALPHA = 0.05;
// Calibrated (not the more obvious 0.95) so the Bayesian rule's final-day-only rate lands near the
// same ~5% nominal rate as the frequentist test — without matching that baseline, the "any day vs.
// final day" comparison between the two methods wouldn't be apples-to-apples. See Methodology.
export const STUDY_BAYESIAN_THRESHOLD = 0.975;
export const STUDY_MC_SAMPLES = 200;
export const STUDY_PRIOR_STRENGTH = 0;

export const DEFAULT_REVENUE_SPEND_RATE = 0.01;
export const DEFAULT_REVENUE_VISITORS_PER_DAY = 500_000;
export const DEFAULT_REVENUE_AVG_SPEND = 50;
export const DEFAULT_CONVERSION_BASELINE_RATE = 0.1;
export const DEFAULT_CONVERSION_VISITORS_PER_DAY = 50;

/** The study exactly as the page first runs it, minus its random seed. */
export function defaultPeekingStudyConfig(seed: number, trials = STUDY_TRIALS): PeekingStudyConfig {
	return {
		true_rate: DEFAULT_REVENUE_SPEND_RATE,
		visitors_per_day: DEFAULT_REVENUE_VISITORS_PER_DAY,
		days: STUDY_DAYS,
		prior_strength: STUDY_PRIOR_STRENGTH,
		trials,
		seed,
		frequentist_alpha: STUDY_FREQUENTIST_ALPHA,
		bayesian_threshold: STUDY_BAYESIAN_THRESHOLD,
		mc_samples: STUDY_MC_SAMPLES,
		metric_type: "revenue",
		avg_revenue_per_spender: DEFAULT_REVENUE_AVG_SPEND,
	};
}
