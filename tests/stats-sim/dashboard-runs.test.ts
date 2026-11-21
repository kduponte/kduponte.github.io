import { describe, expect, it } from "vitest";
import {
	CORRECTIONS,
	HERO_ALPHA,
	HERO_CONFIG,
	HERO_SEEDS,
	inRed,
	meanLift,
	runGaugeDashboard,
	tallyRuns,
	zForTwoSidedP,
} from "../../src/lib/stats-sim/dashboard-runs";
import { standardNormalCdf } from "../../src/lib/stats-sim/frequentist";
import { simulateMetricBatch } from "../../src/lib/stats-sim/multi-metric-experiment";

describe("zForTwoSidedP", () => {
	it("inverts the page's two-sided p-value", () => {
		for (const p of [0.05, 0.01, 0.0025, 0.0005]) {
			const z = zForTwoSidedP(p);
			expect(2 * (1 - standardNormalCdf(z))).toBeCloseTo(p, 9);
		}
	});

	it("gives the textbook 1.96 at alpha = 0.05", () => {
		expect(zForTwoSidedP(0.05)).toBeCloseTo(1.96, 2);
	});
});

describe("runGaugeDashboard", () => {
	const runs = HERO_SEEDS.map((s) => runGaugeDashboard(s));

	it("uses the live experiment's defaults: 20 metrics, 14 null, 6 lifted", () => {
		expect(HERO_CONFIG).toEqual({ num_metrics: 20, fraction_null: 0.7, baseline_rate: 0.1, relative_lift: 0.6, visitors_per_arm: 400 });
		expect(HERO_ALPHA).toBe(0.05);
		for (const run of runs) {
			expect(run.metrics).toHaveLength(20);
			expect(run.metrics.filter((m) => m.is_null)).toHaveLength(14);
		}
	});

	it("runs the seeds 1 to 20 in order", () => {
		expect(HERO_SEEDS).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
	});

	it("carries the batch's own p-values and rates unchanged", () => {
		const batch = simulateMetricBatch({ ...HERO_CONFIG, seed: 1 });
		expect(runs[0].metrics.map((m) => m.p)).toEqual(batch.map((o) => o.p_value));
		expect(runs[0].metrics.map((m) => m.rate_b)).toEqual(batch.map((o) => o.rate_b));
	});

	it("gives each needle a z whose two-sided p-value is the metric's p-value", () => {
		for (const run of runs) {
			for (const m of run.metrics) {
				expect(2 * (1 - standardNormalCdf(Math.abs(m.z)))).toBeCloseTo(m.p, 12);
				expect(Math.sign(m.z) || 0).toBe(Math.sign(m.rate_b - m.rate_a) || 0);
			}
		}
	});

	it("puts a needle in the red exactly when the page's rule flags it, for every seed and rule", () => {
		for (const run of runs) {
			for (const c of CORRECTIONS) {
				for (const m of run.metrics) expect(inRed(m.z, run.redline[c])).toBe(m.flagged[c]);
			}
		}
	});

	it("pushes the redline outward under either correction", () => {
		for (const run of runs) {
			expect(run.redline.bonferroni.z).toBeGreaterThan(run.redline.none.z);
			expect(run.redline.bh.z).toBeGreaterThan(run.redline.none.z);
			expect(run.redline.bh.z).toBeLessThanOrEqual(run.redline.bonferroni.z + 1e-9);
		}
	});

	it("sets Bonferroni's line at alpha/20 and BH's at rank/20 x alpha", () => {
		const run = runs[0];
		expect(run.redline.bonferroni.p).toBeCloseTo(0.0025, 12);
		expect(run.redline.bh.rank).toBe(run.metrics.filter((m) => m.flagged.bh).length);
		expect(run.redline.bh.p).toBeCloseTo((Math.max(run.redline.bh.rank!, 1) / 20) * 0.05, 12);
	});

	it("keeps every needle on a +/-5 dial", () => {
		for (const run of runs) for (const m of run.metrics) expect(Math.abs(m.z)).toBeLessThan(5);
	});

	it("opens on a run where one truly null metric crosses the uncorrected redline and neither correction keeps it", () => {
		const [first] = runs;
		const falseNaive = first.metrics.filter((m) => m.is_null && m.flagged.none);
		expect(falseNaive.map((m) => m.number)).toEqual([9]);
		expect(first.metrics.filter((m) => m.is_null && m.flagged.bonferroni)).toHaveLength(0);
		expect(first.metrics.filter((m) => m.is_null && m.flagged.bh)).toHaveLength(0);
		expect(first.metrics.filter((m) => m.flagged.none)).toHaveLength(6);
	});

	it("tallies false discoveries across the whole seed list", () => {
		expect(tallyRuns(runs).anyFalse).toEqual({ none: 11, bonferroni: 1, bh: 3 });
		expect(tallyRuns(runs).runs).toBe(20);
	});

	it("records each metric's observed lift against the lift the simulation built in", () => {
		for (const run of runs) {
			for (const m of run.metrics) {
				expect(m.lift).toBeCloseTo(m.rate_b / m.rate_a - 1, 12);
				expect(m.true_lift).toBe(m.is_null ? 0 : 0.6);
			}
		}
		expect(runs[0].metrics[8].lift).toBeCloseTo(-0.389, 3); // seed 1's false discovery reads -39% on a true 0%
	});

	it("shows the winner's curse: flagged real lifts read high, more so under stricter rules", () => {
		const { flaggedLift, allLift } = tallyRuns(runs);
		expect(allLift).toBeCloseTo(0.618, 3);
		expect(flaggedLift.none).toBeCloseTo(0.772, 3);
		expect(flaggedLift.bh).toBeCloseTo(0.922, 3);
		expect(flaggedLift.bonferroni).toBeCloseTo(1.035, 3);
		expect(flaggedLift.none!).toBeGreaterThan(allLift!);
		expect(flaggedLift.bonferroni!).toBeGreaterThan(flaggedLift.bh!);
		expect(flaggedLift.bh!).toBeGreaterThan(flaggedLift.none!);
	});

	it("averages lifts only over truly lifted metrics, and returns null when none qualify", () => {
		expect(meanLift(runs[0].metrics, () => false)).toBeNull();
		const six = runs[0].metrics.filter((m) => !m.is_null).map((m) => m.lift as number);
		expect(meanLift(runs[0].metrics)).toBeCloseTo(six.reduce((a, b) => a + b, 0) / 6, 12);
	});
});
