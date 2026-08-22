// CUPED (Controlled-experiment Using Pre-Experiment Data): adjusts a noisy outcome metric using a
// covariate correlated with it but unaffected by treatment (typically the same metric's own
// pre-period value for the same visitor), removing predictable variance without introducing bias.
// The correlated-pair construction below is the same "z0 drives one quantity, a rho-weighted blend
// of z0 and an independent z1 drives the other" trick already used in revenue.ts for correlated
// aggregate sums, applied here per-visitor instead.
import { standardNormal, type Rng } from "./rng";

export interface XYPair {
	x: number; // pre-period value (the covariate)
	y: number; // post-period value (the outcome metric)
}

/** theta = Cov(X,Y) / Var(X), the OLS slope of Y on X, estimated directly from paired samples
 * (no aggregate shortcuts, this is the actual sample covariance/variance computation a real
 * CUPED implementation would run). Returns 0 (no adjustment) if X has no variance to speak of. */
export function estimateTheta(pairs: XYPair[]): number {
	const n = pairs.length;
	if (n === 0) return 0;
	const xMean = pairs.reduce((sum, p) => sum + p.x, 0) / n;
	const yMean = pairs.reduce((sum, p) => sum + p.y, 0) / n;
	let covXY = 0;
	let varX = 0;
	for (const p of pairs) {
		covXY += (p.x - xMean) * (p.y - yMean);
		varX += (p.x - xMean) * (p.x - xMean);
	}
	if (varX === 0) return 0;
	return covXY / varX;
}

/** Y_cuped = Y - theta*(X - xMean): removes the part of Y that's predictable from X. Subtracting
 * a constant (xMean) times a mean-zero-in-expectation term doesn't shift Y's expected value, it
 * only removes variance correlated with X. */
export function cupedAdjustedValue(y: number, x: number, xMean: number, theta: number): number {
	return y - theta * (x - xMean);
}

/** The identity this whole technique rests on: Var(Y_cuped) = Var(Y) * (1 - correlation^2). Kept
 * as its own function so copy and tests can both point at the exact claim being made, rather than
 * re-deriving it inline wherever it's needed. */
export function varianceReductionFactor(correlation: number): number {
	return 1 - correlation * correlation;
}

/**
 * Simulates one (x, y) pair at a target correlation: x is a standard-normal pre-period value,
 * y is Normal(yMean, ySd) with its randomness split between a shared component (weighted by
 * `correlation`) and an independent one, so Corr(X, Y) = correlation exactly in expectation.
 */
export function simulateCorrelatedPair(yMean: number, ySd: number, correlation: number, rng: Rng): XYPair {
	const z0 = standardNormal(rng);
	const z1 = standardNormal(rng);
	const x = z0;
	const yZ = correlation * z0 + Math.sqrt(1 - correlation * correlation) * z1;
	return { x, y: yMean + ySd * yZ };
}
