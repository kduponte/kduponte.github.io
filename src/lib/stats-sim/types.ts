export interface ExperimentConfig {
	true_rate_a: number;
	true_rate_b: number;
	visitors_per_day: number;
	days: number;
	/** 0 (weak/uninformative) .. 1 (skeptical/strong) — see priorStrengthToBetaParams. */
	prior_strength: number;
	seed: number;
	/** Monte Carlo sample count for the Bayesian P(B>A)/credible-interval estimate at each day. */
	mc_samples?: number;
	/** Skip the (more expensive) credible-interval computation when only the win-probability threshold matters, e.g. the repeated-trials peeking study. Defaults to true. */
	compute_credible_interval?: boolean;
}

export interface DaySnapshot {
	day: number;
	visitors_a: number;
	visitors_b: number;
	successes_a: number;
	successes_b: number;
	rate_a: number;
	rate_b: number;
	p_value: number | null;
	posterior_prob_b_beats_a: number | null;
	lift_ci_low: number | null;
	lift_ci_high: number | null;
}

export interface SequentialExperimentResult {
	config: ExperimentConfig;
	days: DaySnapshot[];
}

export interface PeekingStudyConfig {
	/** Null hypothesis: both arms share this true rate. */
	true_rate: number;
	visitors_per_day: number;
	days: number;
	prior_strength: number;
	trials: number;
	seed: number;
	/** Frequentist significance threshold, e.g. 0.05. */
	frequentist_alpha: number;
	/** Bayesian two-sided decision threshold, e.g. 0.95 (a "winner" is declared when P(B>A) is above this or below 1 - this). */
	bayesian_threshold: number;
	mc_samples: number;
}

export interface PeekingStudyResult {
	config: PeekingStudyConfig;
	frequentist_any_day_rate: number;
	frequentist_final_day_rate: number;
	bayesian_any_day_rate: number;
	bayesian_final_day_rate: number;
	/** Day of first "significant"/crossing result, one entry per trial that crossed at all — for a "false positives cluster early" histogram. */
	first_crossing_days_frequentist: number[];
	first_crossing_days_bayesian: number[];
}
