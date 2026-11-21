// Every visitor of one simulated CUPED experiment, as a point cloud: the data behind The Noise
// Problem's glass cube. Pure: no renderer, no DOM.
//
// The visitors are drawn exactly as runCupedExperiment draws them (same seed, same generator, same
// order: each day, visitor i of arm A then visitor i of arm B), so the cloud IS that experiment's
// data, not a look-alike; tests/stats-sim/cuped-cloud.test.ts checks it against the experiment's
// own day-by-day means. The adjustment is the experiment's final-day one: theta and the covariate
// mean are pooled over every visitor in both arms.
import { cupedAdjustedValue, estimateTheta, simulateCorrelatedPair, varianceReductionFactor } from "./cuped";
import type { CupedExperimentConfig } from "./cuped-experiment";
import { mulberry32 } from "./rng";

export type Arm = "A" | "B";

export interface CupedVisitor {
	/** 1-based day the visitor arrived. */
	day: number;
	/** A is control, B is treatment (B's post-period mean carries the true lift). */
	arm: Arm;
	/** Pre-period value, the covariate (standard-normal units, as the simulation draws it). */
	x: number;
	/** Post-period value, the outcome metric. */
	y: number;
}

export interface CupedCloud {
	config: CupedExperimentConfig;
	visitors: CupedVisitor[];
	/** Post-period value after the CUPED adjustment, one per visitor, same order. */
	yAdjusted: number[];
	countA: number;
	countB: number;
	xMean: number;
	yMean: number;
	/** OLS slope of post on pre, pooled over both arms: the adjustment's theta. */
	theta: number;
	/** Sample pre/post correlation of these visitors. */
	correlation: number;
	/** Sample variance (n - 1) of the post-period values, before and after the adjustment. */
	variance: { raw: number; adjusted: number };
	sd: { raw: number; adjusted: number };
	/** adjusted / raw variance: exactly 1 - correlation^2 for the sample correlation. */
	varianceFactor: number;
	/** The same factor at the experiment's set correlation, what the page's formula predicts. */
	expectedVarianceFactor: number;
	/**
	 * Half the plotted range on the pre and post axes, in standard deviations (the pre axis in the
	 * simulation's own standard-normal units, the post axis in y_sd). Both axes share it, so the
	 * cloud's tilt and thickness on screen are set by the correlation alone. Rounded up to a
	 * half SD so every visitor, raw or adjusted, sits inside.
	 */
	halfRangeSd: number;
}

/** Every visitor runCupedExperiment would generate for this config, in its draw order. */
export function simulateCupedVisitors(config: CupedExperimentConfig): CupedVisitor[] {
	const rng = mulberry32(config.seed);
	const visitors: CupedVisitor[] = [];
	for (let day = 1; day <= config.days; day++) {
		for (let i = 0; i < config.visitors_per_day; i++) {
			const a = simulateCorrelatedPair(config.y_mean, config.y_sd, config.correlation, rng);
			const b = simulateCorrelatedPair(config.y_mean + config.true_lift, config.y_sd, config.correlation, rng);
			visitors.push({ day, arm: "A", ...a }, { day, arm: "B", ...b });
		}
	}
	return visitors;
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const sampleVariance = (v: number[], m: number) => v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1);

export function buildCupedCloud(config: CupedExperimentConfig): CupedCloud {
	const visitors = simulateCupedVisitors(config);
	if (visitors.length < 2) throw new Error("A CUPED cloud needs at least two visitors");
	const xs = visitors.map((v) => v.x);
	const ys = visitors.map((v) => v.y);
	const xMean = mean(xs);
	const yMean = mean(ys);
	const theta = estimateTheta(visitors);
	const yAdjusted = visitors.map((v) => cupedAdjustedValue(v.y, v.x, xMean, theta));

	let sxx = 0;
	let syy = 0;
	let sxy = 0;
	for (const v of visitors) {
		sxx += (v.x - xMean) ** 2;
		syy += (v.y - yMean) ** 2;
		sxy += (v.x - xMean) * (v.y - yMean);
	}
	const correlation = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
	const raw = sampleVariance(ys, yMean);
	// The adjustment subtracts a mean-zero term, so the adjusted mean is still yMean.
	const adjusted = sampleVariance(yAdjusted, yMean);

	const extent = Math.max(
		...xs.map(Math.abs),
		...ys.map((y) => Math.abs((y - config.y_mean) / config.y_sd)),
		...yAdjusted.map((y) => Math.abs((y - config.y_mean) / config.y_sd)),
	);

	return {
		config,
		visitors,
		yAdjusted,
		countA: visitors.filter((v) => v.arm === "A").length,
		countB: visitors.filter((v) => v.arm === "B").length,
		xMean,
		yMean,
		theta,
		correlation,
		variance: { raw, adjusted },
		sd: { raw: Math.sqrt(raw), adjusted: Math.sqrt(adjusted) },
		varianceFactor: adjusted / raw,
		expectedVarianceFactor: varianceReductionFactor(config.correlation),
		halfRangeSd: Math.max(3, Math.ceil(extent * 2) / 2),
	};
}

/**
 * Post-period value of visitor i part-way through the adjustment: t = 0 is raw, t = 1 is CUPED,
 * and in between each visitor has moved the fraction t of its own adjustment, -theta * (x - xMean).
 */
export function postValueAt(cloud: CupedCloud, i: number, t: number): number {
	const v = cloud.visitors[i];
	return v.y - t * cloud.theta * (v.x - cloud.xMean);
}

/**
 * Sample variance of the post-period values part-way through the adjustment. Expanding
 * Var(Y - t*theta*X) with theta = Cov/Var(X) gives Var(Y) * (1 - (2t - t^2) * r^2): it falls
 * steadily from Var(Y) at t = 0 to exactly Var(Y) * (1 - r^2) at t = 1.
 */
export function varianceAt(cloud: CupedCloud, t: number): number {
	const k = 2 * t - t * t;
	return cloud.variance.raw * (1 - k * cloud.correlation * cloud.correlation);
}

/**
 * The cloud in normalized cube coordinates, -1 to 1 on each axis, written into `out` as
 * [u, v, w] per visitor: u is the pre-period value and v the post-period value (both over
 * halfRangeSd standard deviations, the post axis centered on y_mean), and w the day of arrival,
 * day 1 at -1 (the back) to the last day at +1 (the front).
 */
export function writeCloudCoordinates(cloud: CupedCloud, t: number, out: Float32Array): Float32Array {
	const { y_mean, y_sd, days } = cloud.config;
	const h = cloud.halfRangeSd;
	cloud.visitors.forEach((v, i) => {
		out[i * 3] = v.x / h;
		out[i * 3 + 1] = (postValueAt(cloud, i, t) - y_mean) / y_sd / h;
		out[i * 3 + 2] = days > 1 ? -1 + (2 * (v.day - 1)) / (days - 1) : 0;
	});
	return out;
}

/** Normalized post-axis position (-1 to 1) of a post-period value. */
export function postAxisPosition(cloud: CupedCloud, value: number): number {
	return (value - cloud.config.y_mean) / cloud.config.y_sd / cloud.halfRangeSd;
}

/** Post-axis tick values, every `step` points across the plotted range. */
export function postAxisTicks(cloud: CupedCloud, step = 20): number[] {
	const { y_mean, y_sd } = cloud.config;
	const lo = y_mean - cloud.halfRangeSd * y_sd;
	const hi = y_mean + cloud.halfRangeSd * y_sd;
	const ticks: number[] = [];
	for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
	return ticks;
}
