// Multiple testing and the winner's curse are two different questions about the same flagged
// "winners", and this measures both on the page's own seeded dashboards (simulateMetricBatch and
// the same three decision rules the live experiment applies), at the live experiment's defaults.
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
import { simulateMetricBatch, type MultiMetricBatchConfig } from "./multi-metric-experiment";
import { benjaminiHochberg, bonferroniRejections, naiveRejections } from "./multiple-testing";

/** The live experiment's defaults (src/scripts/the-dashboard-problem/live-experiment.ts). */
export const CURSE_CONFIG: Omit<MultiMetricBatchConfig, "seed"> = {
	num_metrics: 20,
	fraction_null: 0.7,
	baseline_rate: 0.1,
	relative_lift: 0.6,
	visitors_per_arm: 400,
};
export const CURSE_ALPHA = 0.05;
/** Seeds 1 to 3,000, one simulated dashboard each, none skipped. */
export const CURSE_FIRST_SEED = 1;
export const CURSE_LAST_SEED = 3000;

export type Rule = "none" | "bh" | "bonferroni";
/** Loosest bar to strictest. */
export const RULES: readonly Rule[] = ["none", "bh", "bonferroni"];

export interface RuleTally {
	/** Every metric this rule flagged, across all dashboards. */
	flags: number;
	/** Of those, how many were truly null. */
	null_flags: number;
	/** null_flags / flags, pooled across all dashboards. */
	null_share: number;
	/** Truly lifted metrics this rule flagged. */
	lifted_flags: number;
	/** Average observed relative lift (rate_b / rate_a - 1) of the lifted metrics it flagged. */
	mean_observed_lift: number;
	/** Average observed difference in rates (rate_b - rate_a) of the lifted metrics it flagged. */
	mean_observed_diff: number;
}

export interface WinnersCurseResult {
	first_seed: number;
	last_seed: number;
	dashboards: number;
	alpha: number;
	config: Omit<MultiMetricBatchConfig, "seed">;
	/** The lift every truly lifted metric was simulated with. */
	true_lift: number;
	/** The same lift as a difference in rates. */
	true_diff: number;
	/** Every truly lifted metric across all dashboards, flagged or not. */
	lifted_metrics: number;
	/** Their average observed relative lift: the no-selection yardstick. */
	mean_observed_lift_all: number;
	/** Their average observed difference in rates. */
	mean_observed_diff_all: number;
	/** Lifted metrics whose arm A converted nobody, so no ratio exists. Left out of every lift average. */
	zero_baseline_skipped: number;
	rules: Record<Rule, RuleTally>;
}

interface Accumulator {
	flags: number;
	null_flags: number;
	lifted_flags: number;
	ratio_count: number;
	lift_sum: number;
	diff_sum: number;
}

function emptyAccumulator(): Accumulator {
	return { flags: 0, null_flags: 0, lifted_flags: 0, ratio_count: 0, lift_sum: 0, diff_sum: 0 };
}

export function measureWinnersCurse(
	firstSeed = CURSE_FIRST_SEED,
	lastSeed = CURSE_LAST_SEED,
	config = CURSE_CONFIG,
	alpha = CURSE_ALPHA,
): WinnersCurseResult {
	if (!(lastSeed >= firstSeed)) throw new Error(`measureWinnersCurse needs lastSeed >= firstSeed, got ${firstSeed}..${lastSeed}`);

	const all = emptyAccumulator();
	const byRule: Record<Rule, Accumulator> = { none: emptyAccumulator(), bh: emptyAccumulator(), bonferroni: emptyAccumulator() };
	let zeroBaseline = 0;

	for (let seed = firstSeed; seed <= lastSeed; seed++) {
		const outcomes = simulateMetricBatch({ ...config, seed });
		const pValues = outcomes.map((o) => o.p_value);
		const flagged: Record<Rule, boolean[]> = {
			none: naiveRejections(pValues, alpha),
			bh: benjaminiHochberg(pValues, alpha),
			bonferroni: bonferroniRejections(pValues, alpha),
		};

		outcomes.forEach((o, i) => {
			const hasRatio = o.rate_a > 0;
			const lift = hasRatio ? o.rate_b / o.rate_a - 1 : 0;
			const diff = o.rate_b - o.rate_a;

			if (!o.is_null) {
				all.lifted_flags++;
				all.diff_sum += diff;
				if (hasRatio) {
					all.ratio_count++;
					all.lift_sum += lift;
				} else {
					zeroBaseline++;
				}
			}

			for (const rule of RULES) {
				if (!flagged[rule][i]) continue;
				const acc = byRule[rule];
				acc.flags++;
				if (o.is_null) {
					acc.null_flags++;
					continue;
				}
				acc.lifted_flags++;
				acc.diff_sum += diff;
				if (hasRatio) {
					acc.ratio_count++;
					acc.lift_sum += lift;
				}
			}
		});
	}

	const mean = (sum: number, count: number) => (count > 0 ? sum / count : NaN);
	const tally = (acc: Accumulator): RuleTally => ({
		flags: acc.flags,
		null_flags: acc.null_flags,
		null_share: mean(acc.null_flags, acc.flags),
		lifted_flags: acc.lifted_flags,
		mean_observed_lift: mean(acc.lift_sum, acc.ratio_count),
		mean_observed_diff: mean(acc.diff_sum, acc.lifted_flags),
	});

	const liftedRate = Math.min(0.99, config.baseline_rate * (1 + config.relative_lift));

	return {
		first_seed: firstSeed,
		last_seed: lastSeed,
		dashboards: lastSeed - firstSeed + 1,
		alpha,
		config,
		true_lift: liftedRate / config.baseline_rate - 1,
		true_diff: liftedRate - config.baseline_rate,
		lifted_metrics: all.lifted_flags,
		mean_observed_lift_all: mean(all.lift_sum, all.ratio_count),
		mean_observed_diff_all: mean(all.diff_sum, all.lifted_flags),
		zero_baseline_skipped: zeroBaseline,
		rules: { none: tally(byRule.none), bh: tally(byRule.bh), bonferroni: tally(byRule.bonferroni) },
	};
}
