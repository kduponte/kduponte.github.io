// The Dashboard Problem's hero console: one seeded dashboard per gauge-console "run", built from
// the page's own simulation (simulateMetricBatch, the same two-proportion z-test, and the same
// three decision rules the live experiment applies), at the live experiment's default settings.
//
// Every gauge needle is a metric's signed z statistic. Each rule's redline is the |z| beyond which
// that rule flags a metric, derived from its p-value threshold through the page's own normal CDF,
// so "needle in the red" is exactly "flagged by that rule" (tests/stats-sim/dashboard-runs.test.ts
// checks this for every seed and every rule).
import { standardNormalCdf, twoProportionZTest } from "./frequentist";
import { simulateMetricBatch, type MultiMetricBatchConfig } from "./multi-metric-experiment";
import { benjaminiHochberg, bonferroniRejections, bonferroniThreshold, naiveRejections } from "./multiple-testing";

/** The live experiment's defaults (src/scripts/the-dashboard-problem/live-experiment.ts). */
export const HERO_CONFIG: Omit<MultiMetricBatchConfig, "seed"> = {
	num_metrics: 20,
	fraction_null: 0.7,
	baseline_rate: 0.1,
	relative_lift: 0.6,
	visitors_per_arm: 400,
};
export const HERO_ALPHA = 0.05;
/** Seeds 1 to 20, in order, none skipped. */
export const HERO_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

export type Correction = "none" | "bonferroni" | "bh";
export const CORRECTIONS: readonly Correction[] = ["none", "bonferroni", "bh"];

export interface GaugeMetric {
	/** 1-based, as the live experiment's table numbers them. */
	number: number;
	is_null: boolean;
	rate_a: number;
	rate_b: number;
	/** Signed two-proportion z statistic: positive when arm B converted better. */
	z: number;
	p: number;
	/** Observed relative lift, (rate_b - rate_a) / rate_a; null if arm A converted nobody. */
	lift: number | null;
	/** The lift the simulation actually built in: 0 for a null metric, the configured lift otherwise. */
	true_lift: number;
	flagged: Record<Correction, boolean>;
}

export interface Redline {
	/** The rule's p-value threshold. */
	p: number;
	/** The same threshold as a |z| on the gauge. */
	z: number;
	/** Benjamini-Hochberg rejects p <= threshold; the other two reject p < alpha'. */
	inclusive: boolean;
	/** For BH: how many p-values it rejected (the rank k in k/m x alpha). */
	rank?: number;
}

export interface GaugeRun {
	seed: number;
	alpha: number;
	config: Omit<MultiMetricBatchConfig, "seed">;
	metrics: GaugeMetric[];
	redline: Record<Correction, Redline>;
}

/**
 * The |z| whose two-sided p-value is `p`, inverting the page's own standardNormalCdf by bisection
 * (it is monotone), so the redline sits exactly where the page's p-values cross the threshold.
 */
export function zForTwoSidedP(p: number): number {
	if (!(p > 0 && p < 1)) throw new Error(`zForTwoSidedP needs 0 < p < 1, got ${p}`);
	let lo = 0;
	let hi = 40;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		if (2 * (1 - standardNormalCdf(mid)) > p) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** Whether a z statistic lands in a rule's red zone (either end of the dial). */
export function inRed(z: number, line: Pick<Redline, "z" | "inclusive">): boolean {
	return line.inclusive ? Math.abs(z) >= line.z : Math.abs(z) > line.z;
}

export function runGaugeDashboard(seed: number, config = HERO_CONFIG, alpha = HERO_ALPHA): GaugeRun {
	const n = config.visitors_per_arm;
	const outcomes = simulateMetricBatch({ ...config, seed });
	const pValues = outcomes.map((o) => o.p_value);
	const naive = naiveRejections(pValues, alpha);
	const bonferroni = bonferroniRejections(pValues, alpha);
	const bh = benjaminiHochberg(pValues, alpha);
	const m = pValues.length;

	const metrics = outcomes.map((o, i) => {
		// The batch keeps rates, not counts; rate x visitors recovers the exact counts it tested.
		const test = twoProportionZTest(Math.round(o.rate_a * n), n, Math.round(o.rate_b * n), n);
		return {
			number: o.metric_index + 1,
			is_null: o.is_null,
			rate_a: o.rate_a,
			rate_b: o.rate_b,
			z: test.z ?? 0,
			p: o.p_value,
			lift: o.rate_a > 0 ? o.rate_b / o.rate_a - 1 : null,
			true_lift: o.is_null ? 0 : config.relative_lift,
			flagged: { none: naive[i], bonferroni: bonferroni[i], bh: bh[i] },
		};
	});

	// BH rejects the k smallest p-values, which is the same as rejecting every p <= (k/m) x alpha.
	// With k = 0 nothing clears even rank 1's line, alpha/m, so the redline sits there.
	const rank = bh.filter(Boolean).length;
	const bhP = (Math.max(rank, 1) / m) * alpha;
	const bonfP = bonferroniThreshold(alpha, m);

	return {
		seed,
		alpha,
		config,
		metrics,
		redline: {
			none: { p: alpha, z: zForTwoSidedP(alpha), inclusive: false },
			bonferroni: { p: bonfP, z: zForTwoSidedP(bonfP), inclusive: false },
			bh: { p: bhP, z: zForTwoSidedP(bhP), inclusive: true, rank },
		},
	};
}

/** Mean observed lift of the truly lifted metrics that pass `keep`, or null if none do. */
export function meanLift(metrics: GaugeMetric[], keep: (m: GaugeMetric) => boolean = () => true): number | null {
	const lifts = metrics.filter((m) => !m.is_null && keep(m) && m.lift !== null).map((m) => m.lift as number);
	return lifts.length ? lifts.reduce((a, b) => a + b, 0) / lifts.length : null;
}

export interface RunTally {
	runs: number;
	/** Runs in which at least one truly null metric was flagged, per rule. */
	anyFalse: Record<Correction, number>;
	/** The winner's curse: mean observed lift of the truly lifted metrics each rule flagged, pooled over runs. */
	flaggedLift: Record<Correction, number | null>;
	/** Mean observed lift of every truly lifted metric, flagged or not (the ratio of two noisy rates runs a little high). */
	allLift: number | null;
}

export function tallyRuns(runs: GaugeRun[]): RunTally {
	const anyFalse = { none: 0, bonferroni: 0, bh: 0 };
	for (const run of runs) {
		for (const c of CORRECTIONS) if (run.metrics.some((m) => m.is_null && m.flagged[c])) anyFalse[c]++;
	}
	const pooled = runs.flatMap((r) => r.metrics);
	const flaggedLift = { none: 0, bonferroni: 0, bh: 0 } as Record<Correction, number | null>;
	for (const c of CORRECTIONS) flaggedLift[c] = meanLift(pooled, (m) => m.flagged[c]);
	return { runs: runs.length, anyFalse, flaggedLift, allLift: meanLift(pooled) };
}
