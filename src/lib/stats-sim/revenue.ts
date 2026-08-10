// A two-part ("hurdle") model for a zero-inflated, right-skewed metric like revenue per user:
// most visitors contribute exactly $0, and the rest have a highly skewed distribution of spend.
// This is standard practice for exactly this data shape (econometrics/health-cost modeling use
// the same structure). Part 1 (does this visitor spend at all) is Bernoulli(spend_rate), the
// existing Beta-Binomial machinery in bayesian.ts/rng.ts, reused unchanged. Part 2 (how much,
// given they spend) is log(revenue | revenue > 0) ~ Normal(mu, sigma), with sigma (the log-scale
// spread that controls skew) treated as a fixed constant shared across arms: most treatments move
// whether/how-much people spend, not the underlying shape of spend variability, and this keeps
// the Bayesian side a clean, closed-form conjugate update rather than a full joint model.
import type { BetaParams } from "./bayesian";
import { standardNormalCdf } from "./frequentist";
import type { Rng } from "./rng";
import { betaSample, standardNormal } from "./rng";

export interface LogNormalMoments {
	mean: number;
	variance: number;
}

/** Mean and variance of a Log-Normal(mu, sigma) distribution (standard closed-form identities). */
export function logNormalMeanVariance(mu: number, sigma: number): LogNormalMoments {
	const mean = Math.exp(mu + (sigma * sigma) / 2);
	const variance = (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma);
	return { mean, variance };
}

/** Inverts the log-normal mean formula: given a desired mean revenue-per-spender, what mu produces it at this sigma. */
export function muFromMeanRevenue(meanRevenuePerSpender: number, sigma: number): number {
	return Math.log(Math.max(1e-9, meanRevenuePerSpender)) - (sigma * sigma) / 2;
}

/**
 * Mean and variance of the overall (zero-inflated) hurdle-model random variable X = B*Y, where
 * B ~ Bernoulli(p) and Y is the (independent) spend amount given spending. By the law of total
 * variance: Var[X] = p*Var[Y] + p(1-p)*E[Y]^2 (a within-spenders term plus a between-group term
 * from the point mass at zero).
 */
export function hurdleMeanAndVariance(p: number, mu: number, sigma: number): LogNormalMoments {
	const { mean: meanPerSpender, variance: varPerSpender } = logNormalMeanVariance(mu, sigma);
	const mean = p * meanPerSpender;
	const variance = p * varPerSpender + p * (1 - p) * meanPerSpender * meanPerSpender;
	return { mean, variance };
}

export interface NormalPosterior {
	mean: number;
	variance: number;
}

/**
 * Normal-Normal conjugate update for the mean of a Normal(mu, sigma) sample with KNOWN sigma:
 * prior is Normal(priorMean, sigma^2/priorPseudoCount) — "as if priorPseudoCount prior
 * observations had already been seen" — updated with n new observations summing to sumX.
 */
export function updateNormalPosterior(priorMean: number, priorPseudoCount: number, sigma: number, n: number, sumX: number): NormalPosterior {
	const sigma2 = sigma * sigma;
	const totalPseudoCount = priorPseudoCount + n;
	const mean = (priorPseudoCount * priorMean + sumX) / totalPseudoCount;
	const variance = sigma2 / totalPseudoCount;
	return { mean, variance };
}

/** Normal(mean, sd) sample via the standard normal transform. */
export function normalSample(mean: number, sd: number, rng: Rng): number {
	return mean + sd * standardNormal(rng);
}

function sampleRevenue(betaPosterior: BetaParams, muPosterior: NormalPosterior, sigma: number, rng: Rng): number {
	const p = betaSample(betaPosterior.alpha, betaPosterior.beta, rng);
	const mu = normalSample(muPosterior.mean, Math.sqrt(muPosterior.variance), rng);
	return p * Math.exp(mu + (sigma * sigma) / 2);
}

/**
 * Monte Carlo estimate of P(B > A) for the hurdle model: each sample draws a spend-rate p and a
 * log-revenue mean mu from their respective posteriors for both arms (jointly propagating BOTH
 * sources of posterior uncertainty), combines them into a revenue-per-user estimate, and compares.
 * Same shape as bayesian.ts's probabilityBBeatsA, extended to the two-part model.
 */
export function hurdleProbabilityBBeatsA(
	betaPosteriorA: BetaParams,
	muPosteriorA: NormalPosterior,
	betaPosteriorB: BetaParams,
	muPosteriorB: NormalPosterior,
	sigma: number,
	samples: number,
	rng: Rng,
): number {
	let wins = 0;
	for (let i = 0; i < samples; i++) {
		const revenueA = sampleRevenue(betaPosteriorA, muPosteriorA, sigma, rng);
		const revenueB = sampleRevenue(betaPosteriorB, muPosteriorB, sigma, rng);
		if (revenueB > revenueA) wins++;
	}
	return wins / samples;
}

/** 95% credible interval on the revenue lift (B - A), from the same joint posterior-sampling approach. */
export function hurdleLiftCredibleInterval(
	betaPosteriorA: BetaParams,
	muPosteriorA: NormalPosterior,
	betaPosteriorB: BetaParams,
	muPosteriorB: NormalPosterior,
	sigma: number,
	samples: number,
	rng: Rng,
): { low: number; high: number; median: number } {
	const lifts: number[] = [];
	for (let i = 0; i < samples; i++) {
		const revenueA = sampleRevenue(betaPosteriorA, muPosteriorA, sigma, rng);
		const revenueB = sampleRevenue(betaPosteriorB, muPosteriorB, sigma, rng);
		lifts.push(revenueB - revenueA);
	}
	lifts.sort((x, y) => x - y);
	return {
		low: lifts[Math.floor(0.025 * lifts.length)],
		high: lifts[Math.min(lifts.length - 1, Math.floor(0.975 * lifts.length))],
		median: lifts[Math.floor(0.5 * lifts.length)],
	};
}

export interface TwoSampleMeanTest {
	mean_a: number;
	mean_b: number;
	z: number | null;
	p_value: number | null;
}

/**
 * Two-sample z-test comparing means with known/assumed per-arm variances (Welch-style unpooled
 * SE), reusing the same standardNormalCdf as the proportion test. Standard practice for revenue
 * metrics (in spirit, a Welch's t-test) — at the traffic volumes this project assumes, the
 * t-distribution is indistinguishable from normal, so no separate t-distribution implementation
 * is needed.
 */
export function twoSampleZTestOnMeans(meanA: number, varA: number, nA: number, meanB: number, varB: number, nB: number): TwoSampleMeanTest {
	if (nA === 0 || nB === 0) return { mean_a: meanA, mean_b: meanB, z: null, p_value: null };
	const se = Math.sqrt(varA / nA + varB / nB);
	if (!(se > 0)) return { mean_a: meanA, mean_b: meanB, z: null, p_value: null };
	const z = (meanB - meanA) / se;
	const pValue = 2 * (1 - standardNormalCdf(Math.abs(z)));
	return { mean_a: meanA, mean_b: meanB, z, p_value: pValue };
}
