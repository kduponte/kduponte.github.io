import { describe, expect, it } from "vitest";
import {
	CORRECTIONS,
	LAUNCH_ALPHA,
	LAUNCH_CONFIG,
	LAUNCH_SEEDS,
	METRIC_NAMES,
	clearsBar,
	dealNames,
	meanLift,
	runDashboard,
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

describe("runDashboard", () => {
	const runs = LAUNCH_SEEDS.map((s) => runDashboard(s));

	it("uses the live experiment's defaults: 20 metrics, 14 null, 6 lifted", () => {
		expect(LAUNCH_CONFIG).toEqual({ num_metrics: 20, fraction_null: 0.7, baseline_rate: 0.1, relative_lift: 0.6, visitors_per_arm: 400 });
		expect(LAUNCH_ALPHA).toBe(0.05);
		for (const run of runs) {
			expect(run.metrics).toHaveLength(20);
			expect(run.metrics.filter((m) => m.is_null)).toHaveLength(14);
		}
	});

	it("runs the seeds 1 to 20 in order", () => {
		expect(LAUNCH_SEEDS).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
	});

	it("carries the batch's own p-values and rates unchanged", () => {
		const batch = simulateMetricBatch({ ...LAUNCH_CONFIG, seed: 1 });
		expect(runs[0].metrics.map((m) => m.p)).toEqual(batch.map((o) => o.p_value));
		expect(runs[0].metrics.map((m) => m.rate_b)).toEqual(batch.map((o) => o.rate_b));
	});

	it("gives each metric a z whose two-sided p-value is the metric's p-value", () => {
		for (const run of runs) {
			for (const m of run.metrics) {
				expect(2 * (1 - standardNormalCdf(Math.abs(m.z)))).toBeCloseTo(m.p, 12);
				expect(Math.sign(m.z) || 0).toBe(Math.sign(m.rate_b - m.rate_a) || 0);
			}
		}
	});

	it("clears a metric over the bar exactly when the page's rule flags it, for every seed and rule", () => {
		for (const run of runs) {
			for (const c of CORRECTIONS) {
				for (const m of run.metrics) expect(clearsBar(m.z, run.bar[c])).toBe(m.flagged[c]);
			}
		}
	});

	it("raises the bar under either correction", () => {
		for (const run of runs) {
			expect(run.bar.bonferroni.z).toBeGreaterThan(run.bar.none.z);
			expect(run.bar.bh.z).toBeGreaterThan(run.bar.none.z);
			expect(run.bar.bh.z).toBeLessThanOrEqual(run.bar.bonferroni.z + 1e-9);
		}
	});

	it("sets Bonferroni's line at alpha/20 and BH's at rank/20 x alpha", () => {
		const run = runs[0];
		expect(run.bar.bonferroni.p).toBeCloseTo(0.0025, 12);
		expect(run.bar.bh.rank).toBe(run.metrics.filter((m) => m.flagged.bh).length);
		expect(run.bar.bh.p).toBeCloseTo((Math.max(run.bar.bh.rank!, 1) / 20) * 0.05, 12);
	});

	it("opens on a run where one truly null metric clears the uncorrected bar and neither correction keeps it", () => {
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

	it("gives every metric a name, dealt at random each run", () => {
		for (const run of runs) {
			expect(run.metrics.map((m) => m.name).sort()).toEqual([...METRIC_NAMES].sort());
			expect(run.metrics.map((m) => m.name)).toEqual(dealNames(run.seed, 20));
		}
		expect(dealNames(1, 20)).not.toEqual(dealNames(2, 20));
		expect(dealNames(1, 20)).toEqual(dealNames(1, 20));
		expect(() => dealNames(1, 21)).toThrow();
	});

	it("never ties a name to the truth: across the 20 runs, every name is real in some and null in others", () => {
		const real = new Map<string, number>();
		for (const run of runs) for (const m of run.metrics) if (!m.is_null) real.set(m.name, (real.get(m.name) ?? 0) + 1);
		for (const name of METRIC_NAMES) {
			expect(real.get(name) ?? 0).toBeGreaterThan(0);
			expect(real.get(name)).toBeLessThan(runs.length);
		}
	});
});
