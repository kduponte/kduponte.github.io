// Too Good to Be True's launch dashboard: one seeded dashboard of metric tiles per "run", built from
// the page's own simulation (simulateMetricBatch, the same two-proportion z-test, and the same three
// decision rules the live experiment applies), at the live experiment's default settings.
//
// Each rule's bar is a p-value threshold, also stated as the |z| a metric has to reach, derived
// through the page's own normal CDF, so "clears the bar" is exactly "flagged by that rule"
// (tests/stats-sim/dashboard-runs.test.ts checks this for every seed and every rule).
import { standardNormalCdf, twoProportionZTest } from "./frequentist";
import { simulateMetricBatch, type MultiMetricBatchConfig } from "./multi-metric-experiment";
import { benjaminiHochberg, bonferroniRejections, bonferroniThreshold, naiveRejections } from "./multiple-testing";
import { mulberry32 } from "./rng";

/** The live experiment's defaults (src/scripts/the-dashboard-problem/live-experiment.ts). */
export const LAUNCH_CONFIG: Omit<MultiMetricBatchConfig, "seed"> = {
	num_metrics: 20,
	fraction_null: 0.7,
	baseline_rate: 0.1,
	relative_lift: 0.6,
	visitors_per_arm: 400,
};
export const LAUNCH_ALPHA = 0.05;
/** Seeds 1 to 20, in order, none skipped. */
export const LAUNCH_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

export type Correction = "none" | "bonferroni" | "bh";
export const CORRECTIONS: readonly Correction[] = ["none", "bonferroni", "bh"];

/**
 * Made-up product metric names for the tiles, all rates where higher is better, like the simulated
 * metrics. They are labels only: `dealNames` hands them out at random each run, so a name never
 * says anything about whether its metric truly moved.
 */
export const METRIC_NAMES: readonly string[] = [
	"Sign-up rate",
	"Checkout conversion",
	"Add-to-cart rate",
	"Trial starts",
	"Upgrade rate",
	"Day-7 retention",
	"Search click-through",
	"Onboarding done",
	"Repeat purchase",
	"Newsletter opt-in",
	"Referral rate",
	"Wishlist adds",
	"Promo-code use",
	"Review rate",
	"App installs",
	"Push opt-in",
	"Profile complete",
	"Share rate",
	"Saved a card",
	"Return visits",
];

/** The names' own random stream, kept apart from the simulation's. */
const NAME_STREAM = 0x5eed_0ff;

/** A seeded shuffle of `METRIC_NAMES` (Fisher-Yates), one name per metric. */
export function dealNames(seed: number, count: number): string[] {
	if (count > METRIC_NAMES.length) throw new Error(`dealNames has ${METRIC_NAMES.length} names, asked for ${count}`);
	const rng = mulberry32((seed * 2654435761) ^ NAME_STREAM);
	const names = [...METRIC_NAMES];
	for (let i = names.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[names[i], names[j]] = [names[j], names[i]];
	}
	return names.slice(0, count);
}

export interface DashboardMetric {
	/** 1-based, as the simulation (and the live experiment's table) numbers them. */
	number: number;
	/** A made-up tile name, dealt at random each run (see `dealNames`). */
	name: string;
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

export interface Bar {
	/** The rule's p-value threshold. */
	p: number;
	/** The same threshold as the |z| a metric has to reach. */
	z: number;
	/** Benjamini-Hochberg rejects p <= threshold; the other two reject p < alpha'. */
	inclusive: boolean;
	/** For BH: how many p-values it rejected (the rank k in k/m x alpha). */
	rank?: number;
}

export interface DashboardRun {
	seed: number;
	alpha: number;
	config: Omit<MultiMetricBatchConfig, "seed">;
	metrics: DashboardMetric[];
	bar: Record<Correction, Bar>;
}

/**
 * The |z| whose two-sided p-value is `p`, inverting the page's own standardNormalCdf by bisection
 * (it is monotone), so the bar sits exactly where the page's p-values cross the threshold.
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

/** Whether a z statistic clears a rule's bar, in either direction. */
export function clearsBar(z: number, bar: Pick<Bar, "z" | "inclusive">): boolean {
	return bar.inclusive ? Math.abs(z) >= bar.z : Math.abs(z) > bar.z;
}

export function runDashboard(seed: number, config = LAUNCH_CONFIG, alpha = LAUNCH_ALPHA): DashboardRun {
	const n = config.visitors_per_arm;
	const outcomes = simulateMetricBatch({ ...config, seed });
	const pValues = outcomes.map((o) => o.p_value);
	const naive = naiveRejections(pValues, alpha);
	const bonferroni = bonferroniRejections(pValues, alpha);
	const bh = benjaminiHochberg(pValues, alpha);
	const m = pValues.length;
	const names = dealNames(seed, m);

	const metrics = outcomes.map((o, i) => {
		// The batch keeps rates, not counts; rate x visitors recovers the exact counts it tested.
		const test = twoProportionZTest(Math.round(o.rate_a * n), n, Math.round(o.rate_b * n), n);
		return {
			number: o.metric_index + 1,
			name: names[i],
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
	// With k = 0 nothing clears even rank 1's line, alpha/m, so the bar sits there.
	const rank = bh.filter(Boolean).length;
	const bhP = (Math.max(rank, 1) / m) * alpha;
	const bonfP = bonferroniThreshold(alpha, m);

	return {
		seed,
		alpha,
		config,
		metrics,
		bar: {
			none: { p: alpha, z: zForTwoSidedP(alpha), inclusive: false },
			bonferroni: { p: bonfP, z: zForTwoSidedP(bonfP), inclusive: false },
			bh: { p: bhP, z: zForTwoSidedP(bhP), inclusive: true, rank },
		},
	};
}

/** Mean observed lift of the truly lifted metrics that pass `keep`, or null if none do. */
export function meanLift(metrics: DashboardMetric[], keep: (m: DashboardMetric) => boolean = () => true): number | null {
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

export function tallyRuns(runs: DashboardRun[]): RunTally {
	const anyFalse = { none: 0, bonferroni: 0, bh: 0 };
	for (const run of runs) {
		for (const c of CORRECTIONS) if (run.metrics.some((m) => m.is_null && m.flagged[c])) anyFalse[c]++;
	}
	const pooled = runs.flatMap((r) => r.metrics);
	const flaggedLift = { none: 0, bonferroni: 0, bh: 0 } as Record<Correction, number | null>;
	for (const c of CORRECTIONS) flaggedLift[c] = meanLift(pooled, (m) => m.flagged[c]);
	return { runs: runs.length, anyFalse, flaggedLift, allLift: meanLift(pooled) };
}
