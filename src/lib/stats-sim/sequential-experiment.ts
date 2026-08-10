// Generates one simulated A/B run: cumulative draws per day (not regenerated from scratch each
// day — a genuine accumulating experiment), with the frequentist p-value, Bayesian P(B>A)/
// credible interval, and always-valid p-value recomputed at each day's cumulative totals.
//
// Two metric types: a binary conversion rate (Beta-Binomial throughout), and a two-part hurdle
// model for a zero-inflated, right-skewed metric like revenue per user (Beta-Binomial spend rate
// x Normal-Normal log-revenue mean — see revenue.ts). Both branches share the same rng/cumulative-
// state threading; they're kept as clearly separated code paths rather than one unified abstraction
// since the Bayesian side genuinely differs in structure between the two (a single posterior vs. a
// joint one), and forcing a shared shape would obscure more than it'd save.
import { alwaysValidLikelihoodRatio, alwaysValidPValue, alwaysValidTest, defaultTau2 } from "./always-valid";
import { liftCredibleInterval, priorStrengthToBetaParams, probabilityBBeatsA, updatePosterior } from "./bayesian";
import { twoProportionZTest } from "./frequentist";
import { binomial, mulberry32, standardNormal } from "./rng";
import {
	hurdleLiftCredibleInterval,
	hurdleMeanAndVariance,
	hurdleProbabilityBBeatsA,
	logNormalMeanVariance,
	muFromMeanRevenue,
	twoSampleZTestOnMeans,
	updateNormalPosterior,
} from "./revenue";
import type { DaySnapshot, ExperimentConfig, SequentialExperimentResult } from "./types";

const DEFAULT_MC_SAMPLES = 2000;
const DEFAULT_REVENUE_SIGMA = 1.0;

function runConversionExperiment(config: ExperimentConfig): SequentialExperimentResult {
	const rng = mulberry32(config.seed);
	// Anchored at A's true rate: a real analyst's prior would be based on the control's known or
	// historical rate, not an arbitrary 50/50 split, so both arms start out believing they behave
	// like the (known) control, which is exactly "skeptical that B differs from A" in spirit.
	const prior = priorStrengthToBetaParams(config.prior_strength, config.true_rate_a);
	const mcSamples = config.mc_samples ?? DEFAULT_MC_SAMPLES;
	const computeCi = config.compute_credible_interval ?? true;
	const tau2 = defaultTau2(config.true_rate_a, config.always_valid_relative_effect_size ?? 0.3);

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
		const { p_value: avPValue } = alwaysValidTest(cumSuccessesA, cumVisitorsA, cumSuccessesB, cumVisitorsB, tau2);

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
			metric_value_a: cumSuccessesA / cumVisitorsA,
			metric_value_b: cumSuccessesB / cumVisitorsB,
			p_value,
			posterior_prob_b_beats_a: probBBeatsA,
			lift_ci_low: ci?.low ?? null,
			lift_ci_high: ci?.high ?? null,
			always_valid_p_value: avPValue,
		});
	}

	return { config, days };
}

function runRevenueExperiment(config: ExperimentConfig): SequentialExperimentResult {
	const rng = mulberry32(config.seed);
	const sigma = config.revenue_sigma ?? DEFAULT_REVENUE_SIGMA;
	const avgRevenueA = config.avg_revenue_per_spender_a ?? 50;
	const avgRevenueB = config.avg_revenue_per_spender_b ?? avgRevenueA;
	const muA = muFromMeanRevenue(avgRevenueA, sigma);
	const muB = muFromMeanRevenue(avgRevenueB, sigma);
	// The log-revenue sum (exact) and the raw-dollar sum (CLT approximation) are aggregate
	// statistics of the SAME underlying spenders, not independent quantities — drawing them from
	// two independent normals let the two sums occasionally disagree about which arm was actually
	// higher (the Bayesian posterior, built on the log-sum, could point the opposite direction
	// from the observed dollar mean). Correlation of Corr(sum log X_i, sum X_i), derived from
	// Cov(Z, exp(mu+sigma*Z)) = sigma*E[X] for Z ~ N(0,1): rho = sigma / sqrt(exp(sigma^2) - 1).
	const revenueLogCorrelation = sigma / Math.sqrt(Math.exp(sigma * sigma) - 1);

	// Anchored at A's known/assumed baseline, same "skeptical that B differs from A" philosophy as
	// the conversion path. Both the spend-rate prior and the log-revenue-mean prior share the same
	// pseudo-count k, so the one prior-strength slider still controls both sub-models together.
	const betaPrior = priorStrengthToBetaParams(config.prior_strength, config.true_rate_a);
	const priorPseudoCount = betaPrior.alpha + betaPrior.beta;
	const mcSamples = config.mc_samples ?? DEFAULT_MC_SAMPLES;
	const computeCi = config.compute_credible_interval ?? true;
	// The always-valid test's tau is tuned relative to the baseline MEAN REVENUE (a dollar figure),
	// not the spend rate — defaultTau2 is scale-relative by construction so this is a direct reuse.
	const baselineMeanRevenue = config.true_rate_a * Math.exp(muA + (sigma * sigma) / 2);
	const tau2 = defaultTau2(baselineMeanRevenue, config.always_valid_relative_effect_size ?? 0.3);

	let cumVisitorsA = 0;
	let cumVisitorsB = 0;
	let cumSpendersA = 0;
	let cumSpendersB = 0;
	let cumSumRevenueA = 0;
	let cumSumRevenueB = 0;
	let cumSumLogRevenueA = 0;
	let cumSumLogRevenueB = 0;
	const days: DaySnapshot[] = [];

	for (let day = 1; day <= config.days; day++) {
		const spendersA = binomial(config.visitors_per_day, config.true_rate_a, rng);
		const spendersB = binomial(config.visitors_per_day, config.true_rate_b, rng);
		cumSpendersA += spendersA;
		cumSpendersB += spendersB;
		cumVisitorsA += config.visitors_per_day;
		cumVisitorsB += config.visitors_per_day;

		// Sum of log-revenue among today's spenders is EXACT (sum of n iid Normal(mu, sigma^2) is
		// Normal(n*mu, n*sigma^2)); the raw-dollar sum uses a CLT approximation (accurate at the
		// spender counts this project's traffic volumes produce), clamped since revenue can't be
		// negative. The two draws are correlated (see revenueLogCorrelation above), not independent.
		if (spendersA > 0) {
			const z0 = standardNormal(rng);
			const z1 = standardNormal(rng);
			cumSumLogRevenueA += spendersA * muA + Math.sqrt(spendersA) * sigma * z0;
			const { mean: perSpenderMean, variance: perSpenderVar } = logNormalMeanVariance(muA, sigma);
			const correlatedZ = revenueLogCorrelation * z0 + Math.sqrt(1 - revenueLogCorrelation * revenueLogCorrelation) * z1;
			cumSumRevenueA += Math.max(0, spendersA * perSpenderMean + Math.sqrt(spendersA * perSpenderVar) * correlatedZ);
		}
		if (spendersB > 0) {
			const z0 = standardNormal(rng);
			const z1 = standardNormal(rng);
			cumSumLogRevenueB += spendersB * muB + Math.sqrt(spendersB) * sigma * z0;
			const { mean: perSpenderMean, variance: perSpenderVar } = logNormalMeanVariance(muB, sigma);
			const correlatedZ = revenueLogCorrelation * z0 + Math.sqrt(1 - revenueLogCorrelation * revenueLogCorrelation) * z1;
			cumSumRevenueB += Math.max(0, spendersB * perSpenderMean + Math.sqrt(spendersB * perSpenderVar) * correlatedZ);
		}

		const metricValueA = cumSumRevenueA / cumVisitorsA;
		const metricValueB = cumSumRevenueB / cumVisitorsB;

		// True per-arm hurdle variance, used as the frequentist test's SE input — a documented
		// simplification (a real analysis re-estimates sample variance daily; this keeps the
		// demo's correctness argument simple and is accurate at the traffic volumes assumed here).
		const varA = hurdleMeanAndVariance(config.true_rate_a, muA, sigma).variance;
		const varB = hurdleMeanAndVariance(config.true_rate_b, muB, sigma).variance;
		const { p_value } = twoSampleZTestOnMeans(metricValueA, varA, cumVisitorsA, metricValueB, varB, cumVisitorsB);

		const unpooledVariance = varA / cumVisitorsA + varB / cumVisitorsB;
		const avPValue = unpooledVariance > 0 ? alwaysValidPValue(alwaysValidLikelihoodRatio(metricValueB - metricValueA, unpooledVariance, tau2)) : null;

		const betaPosteriorA = updatePosterior(betaPrior, cumSpendersA, cumVisitorsA - cumSpendersA);
		const betaPosteriorB = updatePosterior(betaPrior, cumSpendersB, cumVisitorsB - cumSpendersB);
		const muPosteriorA = updateNormalPosterior(muA, priorPseudoCount, sigma, cumSpendersA, cumSumLogRevenueA);
		const muPosteriorB = updateNormalPosterior(muB, priorPseudoCount, sigma, cumSpendersB, cumSumLogRevenueB);
		const probBBeatsA = hurdleProbabilityBBeatsA(betaPosteriorA, muPosteriorA, betaPosteriorB, muPosteriorB, sigma, mcSamples, rng);
		const ci = computeCi ? hurdleLiftCredibleInterval(betaPosteriorA, muPosteriorA, betaPosteriorB, muPosteriorB, sigma, mcSamples, rng) : null;

		days.push({
			day,
			visitors_a: cumVisitorsA,
			visitors_b: cumVisitorsB,
			successes_a: cumSpendersA,
			successes_b: cumSpendersB,
			metric_value_a: metricValueA,
			metric_value_b: metricValueB,
			p_value,
			posterior_prob_b_beats_a: probBBeatsA,
			lift_ci_low: ci?.low ?? null,
			lift_ci_high: ci?.high ?? null,
			always_valid_p_value: avPValue,
		});
	}

	return { config, days };
}

export function runSequentialExperiment(config: ExperimentConfig): SequentialExperimentResult {
	return config.metric_type === "revenue" ? runRevenueExperiment(config) : runConversionExperiment(config);
}
