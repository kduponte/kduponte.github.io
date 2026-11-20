// Outlier handling for heavy-tailed metrics: winsorizing (capping) and trimming (dropping) extreme
// values reduce variance by limiting how much a handful of "whale" observations can move a mean, at
// a real cost. If the treatment effect itself is concentrated in that same tail, capping or dropping
// it can attenuate the very effect you're trying to measure. outlier-handling-experiment.ts
// demonstrates that trade-off directly (see Methodology on the page).
//
// Unlike CUPED's plain correlated-normal pair (cuped.ts), a metric worth winsorizing needs to
// actually be heavy-tailed, so this reuses the hurdle/log-normal revenue model already built for
// The Peeking Problem's revenue mode (revenue.ts) rather than inventing a new distribution.
import { hurdleMeanAndVariance, logNormalMeanVariance } from "./revenue";
import { bernoulli, standardNormal, type Rng } from "./rng";

/** One visitor's raw hurdle-model revenue draw: $0 with probability (1 - spendRate), otherwise a
 * Log-Normal(mu, sigma) draw. The same generative model as revenue.ts's hurdleMeanAndVariance, but
 * drawing one visitor at a time rather than working from aggregate posterior parameters. */
export function sampleHurdleRevenue(spendRate: number, mu: number, sigma: number, rng: Rng): number {
	if (!bernoulli(spendRate, rng)) return 0;
	return Math.exp(mu + sigma * standardNormal(rng));
}

/** The p-th percentile (0-1) of a value array, nearest-rank method: exact and deterministic, unlike
 * an interpolated percentile, and easy to check by hand in tests. */
export function percentileThreshold(values: number[], percentile: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1));
	return sorted[rank];
}

/** Caps every value above `threshold` at `threshold`. Same length as the input; values at or below
 * the threshold are untouched. */
export function winsorizeValues(values: number[], threshold: number): number[] {
	return values.map((v) => Math.min(v, threshold));
}

/** Drops every value strictly above `threshold`. Shorter than the input whenever any value exceeds
 * it, unlike winsorizing, which never changes the sample size. */
export function trimValues(values: number[], threshold: number): number[] {
	return values.filter((v) => v <= threshold);
}

/**
 * Solves for the multiplier a top `whaleFraction` slice of a group's spenders needs so that a
 * tail-concentrated lift produces the SAME total population-level dollar lift as a uniform relative
 * lift of `targetRelativeLift` would. This is what makes "uniform" and "tail-concentrated" an
 * apples-to-apples comparison of the same true effect size, differing only in where it lives:
 *
 *   desiredTotalLift = targetRelativeLift * hurdleMean(spendRate, mu, sigma)
 *   whale group's baseline dollar contribution = spendRate * whaleFraction * logNormalMean(mu, sigma)
 *   whaleMultiplier = 1 + desiredTotalLift / (that baseline contribution)
 */
export function computeWhaleLiftMultiplier(
	spendRate: number,
	mu: number,
	sigma: number,
	targetRelativeLift: number,
	whaleFraction: number,
): number {
	const { mean: overallMean } = hurdleMeanAndVariance(spendRate, mu, sigma);
	const { mean: perSpenderMean } = logNormalMeanVariance(mu, sigma);
	const desiredTotalLift = targetRelativeLift * overallMean;
	const whaleBaselineContribution = spendRate * whaleFraction * perSpenderMean;
	if (whaleBaselineContribution <= 0) return 1;
	return 1 + desiredTotalLift / whaleBaselineContribution;
}

/** Arm B, "uniform" scenario: every spender's log-scale mean shifts by the same amount, so the lift
 * is proportional across the whole spend distribution, tail included. */
export function sampleArmBRevenueUniform(spendRate: number, mu: number, sigma: number, targetRelativeLift: number, rng: Rng): number {
	if (!bernoulli(spendRate, rng)) return 0;
	const liftedMu = mu + Math.log(1 + targetRelativeLift);
	return Math.exp(liftedMu + sigma * standardNormal(rng));
}

/** Arm B, "tail-concentrated" scenario: an ordinary baseline draw, then an independent
 * Bernoulli(whaleFraction) decides (among spenders only) whether this visitor is a "whale" whose
 * revenue gets multiplied by `whaleMultiplier`. Non-whale spenders and non-spenders are
 * statistically identical to arm A. */
export function sampleArmBRevenueTailConcentrated(
	spendRate: number,
	mu: number,
	sigma: number,
	whaleFraction: number,
	whaleMultiplier: number,
	rng: Rng,
): number {
	if (!bernoulli(spendRate, rng)) return 0;
	const baseRevenue = Math.exp(mu + sigma * standardNormal(rng));
	return bernoulli(whaleFraction, rng) ? baseRevenue * whaleMultiplier : baseRevenue;
}
