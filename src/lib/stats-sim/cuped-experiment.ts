// Day-by-day simulation of a two-arm experiment on a continuous metric, run twice in parallel:
// once on the raw metric, once on its CUPED-adjusted version, using each visitor's own pre-period
// value as the covariate (see cuped.ts). Theta is re-estimated each day from all data pooled across
// both arms so far (a real analysis fits it once from a genuinely pre-experiment period; pooling
// across arms in-experiment is the documented stand-in used here, since it's the same statistic
// either way, a general X-Y relationship the treatment isn't assumed to change).
import { cupedAdjustedValue, estimateTheta, simulateCorrelatedPair, type XYPair } from "./cuped";
import { twoSampleZTestOnMeans } from "./revenue";
import { mulberry32 } from "./rng";

export interface CupedExperimentConfig {
	true_lift: number; // additive lift applied to arm B's post-period mean only, never to X
	y_mean: number; // arm A's (baseline) post-period mean
	y_sd: number; // shared standard deviation of the post-period metric, both arms
	correlation: number; // Corr(X, Y), the pre/post correlation this whole technique depends on
	visitors_per_day: number;
	days: number;
	seed: number;
}

export interface CupedDaySnapshot {
	day: number;
	raw_mean_a: number;
	raw_mean_b: number;
	raw_p_value: number | null;
	raw_ci_low: number | null;
	raw_ci_high: number | null;
	cuped_mean_a: number;
	cuped_mean_b: number;
	cuped_p_value: number | null;
	cuped_ci_low: number | null;
	cuped_ci_high: number | null;
}

export interface CupedExperimentResult {
	days: CupedDaySnapshot[];
}

function mean(values: number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleVariance(values: number[], m: number): number {
	if (values.length < 2) return 0;
	const sumSq = values.reduce((sum, v) => sum + (v - m) * (v - m), 0);
	return sumSq / (values.length - 1);
}

function confidenceInterval(meanDiff: number, seFromTest: number): { low: number; high: number } {
	return { low: meanDiff - 1.96 * seFromTest, high: meanDiff + 1.96 * seFromTest };
}

export function runCupedExperiment(config: CupedExperimentConfig): CupedExperimentResult {
	const rng = mulberry32(config.seed);
	const pairsA: XYPair[] = [];
	const pairsB: XYPair[] = [];
	const days: CupedDaySnapshot[] = [];

	for (let day = 1; day <= config.days; day++) {
		for (let i = 0; i < config.visitors_per_day; i++) {
			pairsA.push(simulateCorrelatedPair(config.y_mean, config.y_sd, config.correlation, rng));
			pairsB.push(simulateCorrelatedPair(config.y_mean + config.true_lift, config.y_sd, config.correlation, rng));
		}

		const rawYA = pairsA.map((p) => p.y);
		const rawYB = pairsB.map((p) => p.y);
		const rawMeanA = mean(rawYA);
		const rawMeanB = mean(rawYB);
		const rawVarA = sampleVariance(rawYA, rawMeanA);
		const rawVarB = sampleVariance(rawYB, rawMeanB);
		const rawTest = twoSampleZTestOnMeans(rawMeanA, rawVarA, pairsA.length, rawMeanB, rawVarB, pairsB.length);
		const rawSe = Math.sqrt(rawVarA / pairsA.length + rawVarB / pairsB.length);
		const rawCi = rawTest.p_value !== null ? confidenceInterval(rawMeanB - rawMeanA, rawSe) : null;

		const pooled = pairsA.concat(pairsB);
		const xMean = mean(pooled.map((p) => p.x));
		const theta = estimateTheta(pooled);
		const cupedYA = pairsA.map((p) => cupedAdjustedValue(p.y, p.x, xMean, theta));
		const cupedYB = pairsB.map((p) => cupedAdjustedValue(p.y, p.x, xMean, theta));
		const cupedMeanA = mean(cupedYA);
		const cupedMeanB = mean(cupedYB);
		const cupedVarA = sampleVariance(cupedYA, cupedMeanA);
		const cupedVarB = sampleVariance(cupedYB, cupedMeanB);
		const cupedTest = twoSampleZTestOnMeans(cupedMeanA, cupedVarA, cupedYA.length, cupedMeanB, cupedVarB, cupedYB.length);
		const cupedSe = Math.sqrt(cupedVarA / cupedYA.length + cupedVarB / cupedYB.length);
		const cupedCi = cupedTest.p_value !== null ? confidenceInterval(cupedMeanB - cupedMeanA, cupedSe) : null;

		days.push({
			day,
			raw_mean_a: rawMeanA,
			raw_mean_b: rawMeanB,
			raw_p_value: rawTest.p_value,
			raw_ci_low: rawCi?.low ?? null,
			raw_ci_high: rawCi?.high ?? null,
			cuped_mean_a: cupedMeanA,
			cuped_mean_b: cupedMeanB,
			cuped_p_value: cupedTest.p_value,
			cuped_ci_low: cupedCi?.low ?? null,
			cuped_ci_high: cupedCi?.high ?? null,
		});
	}

	return { days };
}
