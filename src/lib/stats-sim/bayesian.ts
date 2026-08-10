// Beta-Binomial posterior for each arm's conversion rate, with P(B beats A) estimated by Monte
// Carlo sampling rather than a closed-form sum: the finite-sum formula for P(Beta1 > Beta2) is
// only tractable for small integer parameters, and posterior counts here reach into the
// thousands (visitors/day x days), where that sum is impractical. Monte Carlo is simple, robust
// across all parameter regimes, and its own noise is directly quantifiable (see bayesian.test.ts).
import { betaSample, type Rng } from "./rng";

export interface BetaParams {
	alpha: number;
	beta: number;
}

export function updatePosterior(prior: BetaParams, successes: number, failures: number): BetaParams {
	return { alpha: prior.alpha + successes, beta: prior.beta + failures };
}

export function posteriorMean(params: BetaParams): number {
	return params.alpha / (params.alpha + params.beta);
}

/** Monte Carlo estimate of P(B > A): draw `samples` pairs from each posterior and compare. */
export function probabilityBBeatsA(posteriorA: BetaParams, posteriorB: BetaParams, samples: number, rng: Rng): number {
	let wins = 0;
	for (let i = 0; i < samples; i++) {
		const a = betaSample(posteriorA.alpha, posteriorA.beta, rng);
		const b = betaSample(posteriorB.alpha, posteriorB.beta, rng);
		if (b > a) wins++;
	}
	return wins / samples;
}

/** 95% credible interval on the lift (B - A), from the same posterior-sampling approach. */
export function liftCredibleInterval(posteriorA: BetaParams, posteriorB: BetaParams, samples: number, rng: Rng): { low: number; high: number; median: number } {
	const lifts: number[] = [];
	for (let i = 0; i < samples; i++) {
		const a = betaSample(posteriorA.alpha, posteriorA.beta, rng);
		const b = betaSample(posteriorB.alpha, posteriorB.beta, rng);
		lifts.push(b - a);
	}
	lifts.sort((x, y) => x - y);
	return {
		low: lifts[Math.floor(0.025 * lifts.length)],
		high: lifts[Math.min(lifts.length - 1, Math.floor(0.975 * lifts.length))],
		median: lifts[Math.floor(0.5 * lifts.length)],
	};
}

/**
 * Maps a 0-1 "prior strength" slider to Beta(k*baselineRate, k*(1-baselineRate)) pseudo-counts:
 * a prior whose MEAN always equals the assumed baseline rate (both arms start believing they
 * behave like the known baseline, which is realistic, e.g. the control's historical rate), and
 * whose CONCENTRATION (k, "pseudo-observations") is what the slider actually controls. Weak
 * (small k) is close to uninformative; strong (large k) takes real evidence to move either arm's
 * estimate away from the baseline, this project's stand-in for "skeptical that A and B differ."
 *
 * Earlier versions of this used a fixed Beta(k, k), centered at 50% regardless of the baseline
 * rate. That's a real bug, not just an imprecision: at a 1% or 10% baseline, a "strong" prior
 * was actively dragging both arms' estimates up toward 50% rather than expressing skepticism
 * about a difference, which would have distorted results specifically in low-baseline-rate,
 * high-traffic regimes. Anchoring the prior's mean at the baseline rate fixes that.
 */
export function priorStrengthToBetaParams(strength01: number, baselineRate: number, priorMinK = 1, priorMaxK = 200): BetaParams {
	const clamped = Math.max(0, Math.min(1, strength01));
	const clampedBaseline = Math.min(0.999, Math.max(0.001, baselineRate));
	const k = priorMinK + clamped * (priorMaxK - priorMinK);
	return { alpha: k * clampedBaseline, beta: k * (1 - clampedBaseline) };
}
