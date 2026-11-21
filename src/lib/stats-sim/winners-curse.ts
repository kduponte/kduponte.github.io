// Too Good to Be True's second trap, measured on the page's own seeded dashboards
// (simulateMetricBatch and the same three decision rules the live experiment applies).
//
// Multiple testing asks whether a flagged metric is real at all: what share of the flags landed on
// a metric that was truly null. The winner's curse asks how big a real winner is: among the truly
// lifted metrics a rule flagged, how far their observed lift overshoots the true lift, because
// clearing the bar selects the draws that happened to come in high. A stricter bar answers the
// first question better and the second one worse.
//
// Observed lift is rate_b / rate_a - 1. A ratio of two noisy rates runs a little high on average
// even with no selection at all (E[1/rate_a] > 1/rate_a, by Jensen's inequality), so the fair
// yardstick for the curse is every lifted metric's average observed lift, flagged or not, not the
// true lift. The plain difference in rates has no such bias, so it is tallied too, as a check that
// the unselected gap is the ratio's doing and not the simulation's.
//
// The re-test re-runs every dashboard on fresh traffic: the same metrics, the same true rates, a
// seed from a separate stream (RETEST_SEED_OFFSET + seed). A flagged metric's re-test result is
// that same metric in the fresh run, tested alone at alpha, so nothing about it was selected.
import { simulateMetricBatch, type MetricOutcome, type MultiMetricBatchConfig } from "./multi-metric-experiment";
import { benjaminiHochberg, bonferroniRejections, naiveRejections } from "./multiple-testing";

export type CurseConfig = Omit<MultiMetricBatchConfig, "seed">;

/** The live experiment's defaults (src/scripts/the-dashboard-problem/live-experiment.ts). */
export const CURSE_CONFIG: CurseConfig = {
	num_metrics: 20,
	fraction_null: 0.7,
	baseline_rate: 0.1,
	relative_lift: 0.6,
	visitors_per_arm: 400,
};
export const CURSE_ALPHA = 0.05;
/** Seeds 1 to 3,000, one simulated dashboard each, none skipped. */
export const CURSE_FIRST_SEED = 1;
export const CURSE_DASHBOARDS = 3000;
/** Re-test seeds live far from any dashboard seed this page uses, so the two never share a stream. */
export const RETEST_SEED_OFFSET = 1_000_000_000;

/** The winner's-curse study's sweeps, each at the live defaults with one setting changed. */
export const STUDY_VISITORS = [100, 200, 400, 800, 1600, 3200, 6400] as const;
export const STUDY_METRIC_COUNTS = [2, 5, 10, 20, 30, 50] as const;

export type Rule = "none" | "bh" | "bonferroni";
/** Loosest bar to strictest. */
export const RULES: readonly Rule[] = ["none", "bh", "bonferroni"];
export const RULE_LABELS: Record<Rule, string> = {
	none: "No correction",
	bh: "Benjamini-Hochberg",
	bonferroni: "Bonferroni",
};

export interface MeasureOptions {
	firstSeed?: number;
	dashboards?: number;
	config?: CurseConfig;
	alpha?: number;
	/** Re-run every dashboard on fresh traffic too (doubles the work). Default true. */
	retest?: boolean;
}

export interface RuleTally {
	/** Every metric this rule flagged, across all dashboards. */
	flags: number;
	/** Of those, how many were truly null. */
	null_flags: number;
	/** null_flags / flags, pooled across all dashboards. Null when nothing was flagged. */
	null_share: number | null;
	/** Truly lifted metrics this rule flagged. */
	lifted_flags: number;
	/** lifted_flags / every truly lifted metric: the rule's power. */
	power: number;
	/** Average observed relative lift (rate_b / rate_a - 1) of the lifted metrics it flagged. */
	mean_observed_lift: number | null;
	/** Average observed difference in rates (rate_b - rate_a) of the lifted metrics it flagged. */
	mean_observed_diff: number | null;
	/** The same lifted metrics' average observed lift when re-tested on fresh traffic. */
	mean_retest_lift: number | null;
	/** The same lifted metrics' average observed difference in rates on the re-test. */
	mean_retest_diff: number | null;
	/** Flags on truly null metrics that the re-test confirmed (p < alpha, same direction). */
	null_flags_confirmed: number;
	/** Flags on truly lifted metrics that the re-test confirmed (p < alpha, same direction). */
	lifted_flags_confirmed: number;
}

export interface WinnersCurseResult {
	first_seed: number;
	last_seed: number;
	dashboards: number;
	alpha: number;
	config: CurseConfig;
	retest: boolean;
	/** The lift every truly lifted metric was simulated with. */
	true_lift: number;
	/** The same lift as a difference in rates. */
	true_diff: number;
	/** Every truly lifted metric across all dashboards, flagged or not. */
	lifted_metrics: number;
	/** Every truly null metric across all dashboards. */
	null_metrics: number;
	/** Their average observed relative lift: the no-selection yardstick. */
	mean_observed_lift_all: number | null;
	/** Their average observed difference in rates. */
	mean_observed_diff_all: number | null;
	/** Lifted metrics whose arm A converted nobody, so no ratio exists. Left out of every lift average. */
	zero_baseline_skipped: number;
	rules: Record<Rule, RuleTally>;
}

/** The lifted arm's true rate, capped the way simulateMetricBatch caps it. */
export function liftedRate(config: CurseConfig): number {
	return Math.min(0.99, config.baseline_rate * (1 + config.relative_lift));
}

/** True lift and true difference in rates for the lifted metrics. */
export function trueEffect(config: CurseConfig): { lift: number; diff: number } {
	const rate = liftedRate(config);
	return { lift: rate / config.baseline_rate - 1, diff: rate - config.baseline_rate };
}

/**
 * The first-order (delta-method) ratio bias in a lift with no selection: E[1/rate_a] is about
 * (1/p)(1 + (1 - p)/(n p)), so the expected observed lift is about (1 + lift)(1 + (1 - p)/(n p)) - 1.
 */
export function ratioBiasFirstOrder(config: CurseConfig): { relative_bias: number; expected_observed_lift: number } {
	const p = config.baseline_rate;
	const n = config.visitors_per_arm;
	const relativeBias = (1 - p) / (n * p);
	return { relative_bias: relativeBias, expected_observed_lift: (1 + trueEffect(config).lift) * (1 + relativeBias) - 1 };
}

function flagsFor(outcomes: MetricOutcome[], alpha: number): Record<Rule, boolean[]> {
	const pValues = outcomes.map((o) => o.p_value);
	return {
		none: naiveRejections(pValues, alpha),
		bh: benjaminiHochberg(pValues, alpha),
		bonferroni: bonferroniRejections(pValues, alpha),
	};
}

/** Lift is undefined when arm A converted nobody; null then, never a fake number. */
function observedLift(o: MetricOutcome): number | null {
	return o.rate_a > 0 ? o.rate_b / o.rate_a - 1 : null;
}

function confirms(original: MetricOutcome, retest: MetricOutcome, alpha: number): boolean {
	const sameDirection = Math.sign(retest.rate_b - retest.rate_a) === Math.sign(original.rate_b - original.rate_a);
	return retest.p_value < alpha && sameDirection;
}

interface Accumulator {
	flags: number;
	null_flags: number;
	lifted_flags: number;
	lift_count: number;
	lift_sum: number;
	diff_sum: number;
	retest_lift_count: number;
	retest_lift_sum: number;
	retest_diff_sum: number;
	null_confirmed: number;
	lifted_confirmed: number;
}

function emptyAccumulator(): Accumulator {
	return {
		flags: 0,
		null_flags: 0,
		lifted_flags: 0,
		lift_count: 0,
		lift_sum: 0,
		diff_sum: 0,
		retest_lift_count: 0,
		retest_lift_sum: 0,
		retest_diff_sum: 0,
		null_confirmed: 0,
		lifted_confirmed: 0,
	};
}

const mean = (sum: number, count: number) => (count > 0 ? sum / count : null);

export function measureWinnersCurse(options: MeasureOptions = {}): WinnersCurseResult {
	const firstSeed = options.firstSeed ?? CURSE_FIRST_SEED;
	const dashboards = options.dashboards ?? CURSE_DASHBOARDS;
	const config = options.config ?? CURSE_CONFIG;
	const alpha = options.alpha ?? CURSE_ALPHA;
	const retest = options.retest ?? true;
	if (!(dashboards >= 1)) throw new Error(`measureWinnersCurse needs at least one dashboard, got ${dashboards}`);

	const byRule: Record<Rule, Accumulator> = { none: emptyAccumulator(), bh: emptyAccumulator(), bonferroni: emptyAccumulator() };
	let liftedMetrics = 0;
	let nullMetrics = 0;
	let allLiftCount = 0;
	let allLiftSum = 0;
	let allDiffSum = 0;
	let zeroBaseline = 0;

	for (let seed = firstSeed; seed < firstSeed + dashboards; seed++) {
		const outcomes = simulateMetricBatch({ ...config, seed });
		const fresh = retest ? simulateMetricBatch({ ...config, seed: RETEST_SEED_OFFSET + seed }) : null;
		const flagged = flagsFor(outcomes, alpha);

		outcomes.forEach((o, i) => {
			const lift = observedLift(o);
			const diff = o.rate_b - o.rate_a;
			if (o.is_null) {
				nullMetrics++;
			} else {
				liftedMetrics++;
				allDiffSum += diff;
				if (lift === null) zeroBaseline++;
				else {
					allLiftCount++;
					allLiftSum += lift;
				}
			}

			for (const rule of RULES) {
				if (!flagged[rule][i]) continue;
				const acc = byRule[rule];
				acc.flags++;
				const confirmed = fresh ? confirms(o, fresh[i], alpha) : false;
				if (o.is_null) {
					acc.null_flags++;
					if (confirmed) acc.null_confirmed++;
					continue;
				}
				acc.lifted_flags++;
				acc.diff_sum += diff;
				if (lift !== null) {
					acc.lift_count++;
					acc.lift_sum += lift;
				}
				if (fresh) {
					if (confirmed) acc.lifted_confirmed++;
					const retestLift = observedLift(fresh[i]);
					acc.retest_diff_sum += fresh[i].rate_b - fresh[i].rate_a;
					if (retestLift !== null) {
						acc.retest_lift_count++;
						acc.retest_lift_sum += retestLift;
					}
				}
			}
		});
	}

	const tally = (acc: Accumulator): RuleTally => ({
		flags: acc.flags,
		null_flags: acc.null_flags,
		null_share: mean(acc.null_flags, acc.flags),
		lifted_flags: acc.lifted_flags,
		power: liftedMetrics > 0 ? acc.lifted_flags / liftedMetrics : 0,
		mean_observed_lift: mean(acc.lift_sum, acc.lift_count),
		mean_observed_diff: mean(acc.diff_sum, acc.lifted_flags),
		mean_retest_lift: retest ? mean(acc.retest_lift_sum, acc.retest_lift_count) : null,
		mean_retest_diff: retest ? mean(acc.retest_diff_sum, acc.lifted_flags) : null,
		null_flags_confirmed: acc.null_confirmed,
		lifted_flags_confirmed: acc.lifted_confirmed,
	});

	const truth = trueEffect(config);
	return {
		first_seed: firstSeed,
		last_seed: firstSeed + dashboards - 1,
		dashboards,
		alpha,
		config,
		retest,
		true_lift: truth.lift,
		true_diff: truth.diff,
		lifted_metrics: liftedMetrics,
		null_metrics: nullMetrics,
		mean_observed_lift_all: mean(allLiftSum, allLiftCount),
		mean_observed_diff_all: mean(allDiffSum, liftedMetrics),
		zero_baseline_skipped: zeroBaseline,
		rules: { none: tally(byRule.none), bh: tally(byRule.bh), bonferroni: tally(byRule.bonferroni) },
	};
}

export interface StudyPoint {
	/** The swept setting's value: visitors per arm, or number of metrics. */
	x: number;
	lifted_metrics: number;
	mean_observed_lift_all: number | null;
	rules: Record<Rule, { lifted_flags: number; power: number; mean_observed_lift: number | null }>;
}

export interface StudySweep {
	setting: "visitors_per_arm" | "num_metrics";
	first_seed: number;
	dashboards: number;
	alpha: number;
	base_config: CurseConfig;
	true_lift: number;
	points: StudyPoint[];
}

function studyPoint(x: number, r: WinnersCurseResult): StudyPoint {
	const pick = (rule: Rule) => ({
		lifted_flags: r.rules[rule].lifted_flags,
		power: r.rules[rule].power,
		mean_observed_lift: r.rules[rule].mean_observed_lift,
	});
	return {
		x,
		lifted_metrics: r.lifted_metrics,
		mean_observed_lift_all: r.mean_observed_lift_all,
		rules: { none: pick("none"), bh: pick("bh"), bonferroni: pick("bonferroni") },
	};
}

/**
 * The winner's-curse study: the same seeds at every point, the live defaults with one setting
 * changed, no re-test (it isn't plotted). Every rule's threshold moves with the number of metrics
 * (Bonferroni's is alpha / m; BH's depends on how many p-values clear their rank's line), while
 * visitors per arm moves power, which is what the curse feeds on.
 */
export function runCurseStudy(
	setting: StudySweep["setting"],
	values: readonly number[],
	options: Omit<MeasureOptions, "retest"> = {},
): StudySweep {
	const firstSeed = options.firstSeed ?? CURSE_FIRST_SEED;
	const dashboards = options.dashboards ?? CURSE_DASHBOARDS;
	const baseConfig = options.config ?? CURSE_CONFIG;
	const alpha = options.alpha ?? CURSE_ALPHA;
	const points = values.map((x) =>
		studyPoint(x, measureWinnersCurse({ firstSeed, dashboards, alpha, retest: false, config: { ...baseConfig, [setting]: x } })),
	);
	return { setting, first_seed: firstSeed, dashboards, alpha, base_config: baseConfig, true_lift: trueEffect(baseConfig).lift, points };
}

export interface MetricObservation {
	seed: number;
	/** 1-based, as the live experiment's table numbers them. */
	metric: number;
	is_null: boolean;
	/** Observed relative lift; null when arm A converted nobody. */
	lift: number | null;
	p: number;
	flagged: Record<Rule, boolean>;
	/** The same metric's observed lift on the fresh-traffic re-test. */
	retest_lift: number | null;
}

/** Every metric of every dashboard in a seed range, for the interactive histogram. */
export function collectObservations(options: Omit<MeasureOptions, "retest"> = {}): MetricObservation[] {
	const firstSeed = options.firstSeed ?? CURSE_FIRST_SEED;
	const dashboards = options.dashboards ?? CURSE_DASHBOARDS;
	const config = options.config ?? CURSE_CONFIG;
	const alpha = options.alpha ?? CURSE_ALPHA;
	const out: MetricObservation[] = [];
	for (let seed = firstSeed; seed < firstSeed + dashboards; seed++) {
		const outcomes = simulateMetricBatch({ ...config, seed });
		const fresh = simulateMetricBatch({ ...config, seed: RETEST_SEED_OFFSET + seed });
		const flagged = flagsFor(outcomes, alpha);
		outcomes.forEach((o, i) => {
			out.push({
				seed,
				metric: o.metric_index + 1,
				is_null: o.is_null,
				lift: observedLift(o),
				p: o.p_value,
				flagged: { none: flagged.none[i], bh: flagged.bh[i], bonferroni: flagged.bonferroni[i] },
				retest_lift: observedLift(fresh[i]),
			});
		});
	}
	return out;
}

export interface ObservationSummary {
	flags: number;
	null_flags: number;
	lifted_flags: number;
	lifted_metrics: number;
	mean_lift_all: number | null;
	mean_lift_flagged: number | null;
	mean_retest_flagged: number | null;
}

/** One rule's summary of a set of observations: the numbers the interactive prints. */
export function summarizeObservations(observations: MetricObservation[], rule: Rule): ObservationSummary {
	let flags = 0;
	let nullFlags = 0;
	let liftedFlags = 0;
	let liftedMetrics = 0;
	let allSum = 0;
	let allCount = 0;
	let flaggedSum = 0;
	let flaggedCount = 0;
	let retestSum = 0;
	let retestCount = 0;
	for (const o of observations) {
		if (!o.is_null) {
			liftedMetrics++;
			if (o.lift !== null) {
				allSum += o.lift;
				allCount++;
			}
		}
		if (!o.flagged[rule]) continue;
		flags++;
		if (o.is_null) {
			nullFlags++;
			continue;
		}
		liftedFlags++;
		if (o.lift !== null) {
			flaggedSum += o.lift;
			flaggedCount++;
		}
		if (o.retest_lift !== null) {
			retestSum += o.retest_lift;
			retestCount++;
		}
	}
	return {
		flags,
		null_flags: nullFlags,
		lifted_flags: liftedFlags,
		lifted_metrics: liftedMetrics,
		mean_lift_all: mean(allSum, allCount),
		mean_lift_flagged: mean(flaggedSum, flaggedCount),
		mean_retest_flagged: mean(retestSum, retestCount),
	};
}

/** "+78%", "−12%", or "—" when there's nothing to average. */
export function formatLift(x: number | null): string {
	if (x === null) return "—";
	const pct = Math.round(Math.abs(x) * 100);
	return `${x < 0 && pct > 0 ? "−" : "+"}${pct}%`;
}

/** "13.8%", or "—" when there's nothing to divide. */
export function formatShare(x: number | null, digits = 1): string {
	return x === null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

export function formatCount(n: number): string {
	return n.toLocaleString("en-US");
}
