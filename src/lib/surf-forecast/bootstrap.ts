// Moving-block bootstrap for forecast errors.
//
// Forecast errors are not independent. A blown swell call is blown at 00, 06, 12 and 18 UTC alike,
// and a model that misreads a storm misreads it for days. Treat every pair as an independent draw
// and the standard error comes out far too small, so a difference between two models looks
// decisive when the data cannot actually tell them apart.
//
// The fix is to resample whole runs of consecutive days instead of individual pairs, so each
// resample keeps the clustering the real data has. Both intervals are returned on purpose: the
// naive one alongside the honest one, because the ratio between them (and the effective sample
// size it implies) is a finding in its own right rather than a technicality to hide.
import { quantile } from "../stats-sim/descriptive";
import { mulberry32 } from "../stats-sim/rng";

export interface BlockBootstrapResult {
	/** The statistic on the original data: the pooled mean of every value. */
	estimate: number;
	ci_low: number;
	ci_high: number;
	/** Standard error with day-blocks resampled, which respects the clustering. */
	se_block: number;
	/** Standard error assuming every value is independent, which is what a naive test assumes. */
	se_naive: number;
	naive_ci_low: number;
	naive_ci_high: number;
	n_values: number;
	n_days: number;
	block_days: number;
	resamples: number;
	/**
	 * How many independent values the data is actually worth: n * (se_naive / se_block)^2. Tens of
	 * thousands of pairs that move together carry the information of far fewer independent ones.
	 */
	effective_n: number;
}

export interface BlockBootstrapOptions {
	/** Days per block. Five covers the lifetime of a typical swell event. */
	blockDays?: number;
	resamples?: number;
	seed?: number;
	/** Confidence level for both intervals. */
	level?: number;
}

/** Two-sided normal critical value for the levels this project uses. */
function zFor(level: number): number {
	if (Math.abs(level - 0.95) < 1e-9) return 1.959963984540054;
	if (Math.abs(level - 0.9) < 1e-9) return 1.6448536269514722;
	if (Math.abs(level - 0.99) < 1e-9) return 2.5758293035489004;
	throw new Error(`unsupported confidence level ${level}`);
}

function sampleSd(xs: number[]): number {
	const n = xs.length;
	if (n < 2) return 0;
	let m = 0;
	for (const x of xs) m += x;
	m /= n;
	let ss = 0;
	for (const x of xs) ss += (x - m) ** 2;
	return Math.sqrt(ss / (n - 1));
}

/**
 * Bootstrap interval for the pooled mean of day-grouped values. `days` must be in chronological
 * order, one inner array per day, since a block is a run of adjacent entries.
 *
 * Returns null when there is too little data to resample meaningfully: fewer than two days with
 * any values in them.
 */
export function blockBootstrapMean(days: number[][], options: BlockBootstrapOptions = {}): BlockBootstrapResult | null {
	const nonEmpty = days.filter((d) => d.length > 0);
	const nDays = nonEmpty.length;
	if (nDays < 2) return null;

	const level = options.level ?? 0.95;
	const resamples = options.resamples ?? 2000;
	const blockDays = Math.max(1, Math.min(options.blockDays ?? 5, Math.floor(nDays / 2)));
	const rng = mulberry32(options.seed ?? 20260915);

	const daySums = nonEmpty.map((d) => d.reduce((a, b) => a + b, 0));
	const dayCounts = nonEmpty.map((d) => d.length);
	const all = nonEmpty.flat();
	const nValues = all.length;
	const estimate = daySums.reduce((a, b) => a + b, 0) / nValues;

	const starts = nDays - blockDays + 1;
	const means: number[] = new Array(resamples);
	for (let b = 0; b < resamples; b++) {
		let sum = 0;
		let count = 0;
		let taken = 0;
		while (taken < nDays) {
			const start = Math.floor(rng() * starts);
			for (let k = 0; k < blockDays && taken < nDays; k++, taken++) {
				sum += daySums[start + k];
				count += dayCounts[start + k];
			}
		}
		means[b] = sum / count;
	}

	const alpha = 1 - level;
	const seBlock = sampleSd(means);
	const seNaive = sampleSd(all) / Math.sqrt(nValues);
	const z = zFor(level);

	return {
		estimate,
		ci_low: quantile(means, alpha / 2),
		ci_high: quantile(means, 1 - alpha / 2),
		se_block: seBlock,
		se_naive: seNaive,
		naive_ci_low: estimate - z * seNaive,
		naive_ci_high: estimate + z * seNaive,
		n_values: nValues,
		n_days: nDays,
		block_days: blockDays,
		resamples,
		effective_n: seBlock > 0 ? nValues * (seNaive / seBlock) ** 2 : nValues,
	};
}

/** True when an interval excludes zero, i.e. the difference it brackets is distinguishable from
 * no difference at all at that interval's level. */
export function excludesZero(low: number, high: number): boolean {
	return low > 0 || high < 0;
}
