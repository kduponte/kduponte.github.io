export type MetricType = "conversion" | "revenue";

export interface ExperimentConfig {
	/** In conversion mode, the arm's true conversion rate. In revenue mode, the arm's true
	 * "spend rate" (probability a visitor spends anything > $0) — the hurdle model's Part 1. Same
	 * field, same underlying role (a Bernoulli rate), reused across both metric types. */
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
	/** Relative effect size the always-valid test is tuned to detect efficiently — see defaultTau2 in always-valid.ts. Defaults to 0.3 (tuned around a ~30% relative lift). */
	always_valid_relative_effect_size?: number;
	/** "conversion" (default) or "revenue" — see revenue.ts for the two-part hurdle model used in revenue mode. */
	metric_type?: MetricType;
	/** Revenue mode only: mean revenue per spender (given they spend anything), the hurdle model's Part 2. */
	avg_revenue_per_spender_a?: number;
	avg_revenue_per_spender_b?: number;
	/** Revenue mode only: log-scale spread of spend amount among spenders (controls skew), fixed and shared across arms. Defaults to 1.0. */
	revenue_sigma?: number;
}

export interface DaySnapshot {
	day: number;
	visitors_a: number;
	visitors_b: number;
	/** Conversion mode: count of converters. Revenue mode: count of spenders (still the hurdle model's Part 1 count). */
	successes_a: number;
	successes_b: number;
	/** The metric's value in its own native units: a 0-1 proportion in conversion mode, a mean dollar amount per visitor in revenue mode. Named generically since "rate" would be misleading for a dollar figure. */
	metric_value_a: number;
	metric_value_b: number;
	p_value: number | null;
	posterior_prob_b_beats_a: number | null;
	lift_ci_low: number | null;
	lift_ci_high: number | null;
	/** "Always-valid p-value" from the mixture Bayes-factor test — see always-valid.ts. Unlike
	 * p_value and posterior_prob_b_beats_a, this one is designed to stay valid under continuous
	 * monitoring, and the peeking study exists specifically to check whether it actually does. */
	always_valid_p_value: number | null;
}

export interface SequentialExperimentResult {
	config: ExperimentConfig;
	days: DaySnapshot[];
}

export interface PeekingStudyConfig {
	/** Null hypothesis: both arms share this true rate (conversion mode: conversion rate; revenue mode: spend rate). */
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
	/** Relative effect size the always-valid test is tuned to detect efficiently — see defaultTau2 in always-valid.ts. Defaults to 0.3. */
	always_valid_relative_effect_size?: number;
	/** "conversion" (default) or "revenue" — see revenue.ts. */
	metric_type?: MetricType;
	/** Revenue mode only: mean revenue per spender, shared by both arms under the null. */
	avg_revenue_per_spender?: number;
	revenue_sigma?: number;
}

export interface PeekingStudyResult {
	config: PeekingStudyConfig;
	frequentist_any_day_rate: number;
	frequentist_final_day_rate: number;
	bayesian_any_day_rate: number;
	bayesian_final_day_rate: number;
	always_valid_any_day_rate: number;
	always_valid_final_day_rate: number;
	/** Day of first "significant"/crossing result, one entry per trial that crossed at all — for a "false positives cluster early" histogram. */
	first_crossing_days_frequentist: number[];
	first_crossing_days_bayesian: number[];
	first_crossing_days_always_valid: number[];
}
