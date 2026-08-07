// Generates one simulated A/B run: cumulative Binomial draws per day (not regenerated from
// scratch each day — a genuine accumulating experiment), with the frequentist p-value and
// Bayesian P(B>A)/credible interval recomputed at each day's cumulative totals.
import { updatePosterior, probabilityBBeatsA, liftCredibleInterval, priorStrengthToBetaParams } from "./bayesian";
import { twoProportionZTest } from "./frequentist";
import { binomial, mulberry32 } from "./rng";
import type { DaySnapshot, ExperimentConfig, SequentialExperimentResult } from "./types";

const DEFAULT_MC_SAMPLES = 2000;

export function runSequentialExperiment(config: ExperimentConfig): SequentialExperimentResult {
	const rng = mulberry32(config.seed);
	const prior = priorStrengthToBetaParams(config.prior_strength);
	const mcSamples = config.mc_samples ?? DEFAULT_MC_SAMPLES;
	const computeCi = config.compute_credible_interval ?? true;

	let cumSuccessesA = 0;
	let cumSuccessesB = 0;
	let cumVisitorsA = 0;
	let cumVisitorsB = 0;
	const days: DaySnapshot[] = [];

	for (let day = 1; day <= config.days; day++) {
		cumSuccessesA += binomial(config.visitors_per_day, config.true_rate_a, rng);
		cumSuccessesB += binomial(config.visitors_per_day, config.true_rate_b, rng);
		cumVisitorsA += config.visitors_per_day;
		cumVisitorsB += config.visitors_per_day;

		const { p_value } = twoProportionZTest(cumSuccessesA, cumVisitorsA, cumSuccessesB, cumVisitorsB);

		const posteriorA = updatePosterior(prior, cumSuccessesA, cumVisitorsA - cumSuccessesA);
		const posteriorB = updatePosterior(prior, cumSuccessesB, cumVisitorsB - cumSuccessesB);
		const probBBeatsA = probabilityBBeatsA(posteriorA, posteriorB, mcSamples, rng);
		const ci = computeCi ? liftCredibleInterval(posteriorA, posteriorB, mcSamples, rng) : null;

		days.push({
			day,
			visitors_a: cumVisitorsA,
			visitors_b: cumVisitorsB,
			successes_a: cumSuccessesA,
			successes_b: cumSuccessesB,
			rate_a: cumSuccessesA / cumVisitorsA,
			rate_b: cumSuccessesB / cumVisitorsB,
			p_value,
			posterior_prob_b_beats_a: probBBeatsA,
			lift_ci_low: ci?.low ?? null,
			lift_ci_high: ci?.high ?? null,
		});
	}

	return { config, days };
}
