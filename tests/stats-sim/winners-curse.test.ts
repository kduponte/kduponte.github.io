import { describe, expect, it } from "vitest";
import { runMultiMetricStudy } from "../../src/lib/stats-sim/multi-metric-study";
import {
	collectObservations,
	CURSE_ALPHA,
	CURSE_CONFIG,
	measureWinnersCurse,
	ratioBiasFirstOrder,
	RULES,
	runCurseStudy,
	STUDY_METRIC_COUNTS,
	STUDY_VISITORS,
	summarizeObservations,
	trueEffect,
	type Rule,
} from "../../src/lib/stats-sim/winners-curse";

// The numbers Too Good to Be True prints about the winner's curse, pinned so a change to the
// simulation that moves them fails here before it quietly changes the page.
describe("measureWinnersCurse at the live experiment's defaults, seeds 1 to 3,000", () => {
	const result = measureWinnersCurse();

	it("runs the live experiment's defaults over seeds 1 to 3,000, with a re-test", () => {
		expect(CURSE_CONFIG).toEqual({ num_metrics: 20, fraction_null: 0.7, baseline_rate: 0.1, relative_lift: 0.6, visitors_per_arm: 400 });
		expect(CURSE_ALPHA).toBe(0.05);
		expect(result).toMatchObject({ first_seed: 1, last_seed: 3000, dashboards: 3000, retest: true });
		expect(result.lifted_metrics).toBe(3000 * 6);
		expect(result.null_metrics).toBe(3000 * 14);
		expect(result.zero_baseline_skipped).toBe(0);
	});

	it("pins the unselected yardstick: true +60%, observed +64% on average", () => {
		expect(result.true_lift).toBeCloseTo(0.6, 12);
		expect(result.mean_observed_lift_all).toBeCloseTo(0.6405, 4);
	});

	it("puts the unselected +4 points down to ratio bias: the plain rate difference lands on the truth", () => {
		// E[rate_b / rate_a] = p_b * E[1 / rate_a] > p_b / p_a. The first-order delta-method term,
		// (1 - p) / (n * p), predicts +63.6%; the difference in rates has no such term.
		const firstOrder = ratioBiasFirstOrder(CURSE_CONFIG);
		expect(firstOrder.relative_bias).toBeCloseTo(0.0225, 12);
		expect(firstOrder.expected_observed_lift).toBeCloseTo(0.636, 12);
		expect(result.mean_observed_lift_all!).toBeGreaterThan(firstOrder.expected_observed_lift - 0.005);
		expect(result.mean_observed_lift_all!).toBeLessThan(firstOrder.expected_observed_lift + 0.01);
		expect(result.true_diff).toBeCloseTo(0.06, 12);
		expect(result.mean_observed_diff_all).toBeCloseTo(0.0602, 4);
		expect(Math.abs(result.mean_observed_diff_all! - result.true_diff)).toBeLessThan(0.001);
	});

	it("pins each rule's flag counts and null share", () => {
		expect(result.rules.none).toMatchObject({ flags: 14998, null_flags: 2076, lifted_flags: 12922 });
		expect(result.rules.bh).toMatchObject({ flags: 8700, null_flags: 438, lifted_flags: 8262 });
		expect(result.rules.bonferroni).toMatchObject({ flags: 5707, null_flags: 111, lifted_flags: 5596 });
		// No correction: 13.8% of flags are null, the page's "around one in eight".
		expect(result.rules.none.null_share).toBeCloseTo(0.1384, 4);
		expect(result.rules.bh.null_share).toBeCloseTo(0.0503, 4);
		expect(result.rules.bonferroni.null_share).toBeCloseTo(0.0194, 4);
	});

	it("pins each rule's average observed lift among the real winners it flagged", () => {
		expect(result.rules.none.mean_observed_lift).toBeCloseTo(0.7782, 4);
		expect(result.rules.bh.mean_observed_lift).toBeCloseTo(0.9083, 4);
		expect(result.rules.bonferroni.mean_observed_lift).toBeCloseTo(1.0117, 4);
	});

	it("pins the re-test: the same winners on fresh traffic land back on the unselected average", () => {
		expect(result.rules.none.mean_retest_lift).toBeCloseTo(0.6363, 4);
		expect(result.rules.bh.mean_retest_lift).toBeCloseTo(0.6378, 4);
		expect(result.rules.bonferroni.mean_retest_lift).toBeCloseTo(0.6376, 4);
		for (const rule of RULES) {
			expect(Math.abs(result.rules[rule].mean_retest_lift! - result.mean_observed_lift_all!)).toBeLessThan(0.01);
			expect(Math.abs(result.rules[rule].mean_retest_diff! - result.true_diff)).toBeLessThan(0.001);
		}
	});

	it("pins how many flags the re-test confirms: real winners at about the test's power, false ones rarely", () => {
		expect(result.rules.none).toMatchObject({ null_flags_confirmed: 51, lifted_flags_confirmed: 9259 });
		expect(result.rules.bh).toMatchObject({ null_flags_confirmed: 13, lifted_flags_confirmed: 5923 });
		expect(result.rules.bonferroni).toMatchObject({ null_flags_confirmed: 2, lifted_flags_confirmed: 4007 });
		// A false flag confirms only by a same-direction fluke: about alpha / 2.
		expect(result.rules.none.null_flags_confirmed / result.rules.none.null_flags).toBeCloseTo(CURSE_ALPHA / 2, 2);
	});

	it("a stricter bar cuts false flags and worsens the curse, on both scales", () => {
		for (let i = 1; i < RULES.length; i++) {
			const looser = result.rules[RULES[i - 1]];
			const stricter = result.rules[RULES[i]];
			expect(stricter.null_share!).toBeLessThan(looser.null_share!);
			expect(stricter.mean_observed_lift!).toBeGreaterThan(looser.mean_observed_lift!);
			expect(stricter.mean_observed_diff!).toBeGreaterThan(looser.mean_observed_diff!);
		}
		expect(result.rules.none.mean_observed_lift!).toBeGreaterThan(result.mean_observed_lift_all!);
		expect(result.rules.none.mean_observed_diff!).toBeGreaterThan(result.mean_observed_diff_all!);
	});

	it("agrees with the metric-count study's power over the same 3,000 seeds", () => {
		const study = runMultiMetricStudy({ ...CURSE_CONFIG, alpha: CURSE_ALPHA, trials: 3000, seed: 1 });
		expect(result.rules.none.power).toBeCloseTo(study.naive_power, 12);
		expect(result.rules.bh.power).toBeCloseTo(study.bh_power, 12);
		expect(result.rules.bonferroni.power).toBeCloseTo(study.bonferroni_power, 12);
	});

	it("is deterministic for a fixed seed range, and the re-test doesn't change the first run", () => {
		expect(measureWinnersCurse({ firstSeed: 5, dashboards: 36 })).toEqual(measureWinnersCurse({ firstSeed: 5, dashboards: 36 }));
		const withRetest = measureWinnersCurse({ firstSeed: 5, dashboards: 36 });
		const without = measureWinnersCurse({ firstSeed: 5, dashboards: 36, retest: false });
		for (const rule of RULES) {
			expect(without.rules[rule].mean_observed_lift).toBe(withRetest.rules[rule].mean_observed_lift);
			expect(without.rules[rule].mean_retest_lift).toBeNull();
		}
	});

	it("rejects an empty seed range", () => {
		expect(() => measureWinnersCurse({ dashboards: 0 })).toThrow();
	});
});

// [x, every lifted metric, none, BH, Bonferroni, lifted flags none, BH, Bonferroni]
type PinnedPoint = [number, number, number, number, number, number, number, number];

function expectPoints(sweep: ReturnType<typeof runCurseStudy>, pinned: PinnedPoint[]) {
	expect(sweep.points.map((p) => p.x)).toEqual(pinned.map((p) => p[0]));
	sweep.points.forEach((p, i) => {
		const [, all, none, bh, bonferroni, nNone, nBh, nBonferroni] = pinned[i];
		expect(p.mean_observed_lift_all).toBeCloseTo(all, 4);
		expect(p.rules.none.mean_observed_lift).toBeCloseTo(none, 4);
		expect(p.rules.bh.mean_observed_lift).toBeCloseTo(bh, 4);
		expect(p.rules.bonferroni.mean_observed_lift).toBeCloseTo(bonferroni, 4);
		expect([p.rules.none.lifted_flags, p.rules.bh.lifted_flags, p.rules.bonferroni.lifted_flags]).toEqual([nNone, nBh, nBonferroni]);
	});
}

describe("runCurseStudy over seeds 1 to 3,000 per point", () => {
	const headline = measureWinnersCurse({ retest: false });

	describe("visitors per arm", () => {
		const sweep = runCurseStudy("visitors_per_arm", STUDY_VISITORS);

		it("pins every point", () => {
			expect(sweep).toMatchObject({ first_seed: 1, dashboards: 3000, alpha: 0.05 });
			expectPoints(sweep, [
				[100, 0.7847, 1.834, 3.2161, 3.4514, 4400, 715, 574],
				[200, 0.6786, 1.1048, 1.5323, 1.6716, 7751, 2511, 1818],
				[400, 0.6405, 0.7782, 0.9083, 1.0117, 12922, 8262, 5596],
				[800, 0.6188, 0.6404, 0.6682, 0.7193, 17063, 15607, 12766],
				[1600, 0.6093, 0.6097, 0.6111, 0.616, 17984, 17917, 17642],
				[3200, 0.6045, 0.6045, 0.6045, 0.6045, 18000, 18000, 18000],
				[6400, 0.6022, 0.6022, 0.6022, 0.6022, 18000, 18000, 18000],
			]);
		});

		it("matches the headline run at the live default of 400", () => {
			const at400 = sweep.points.find((p) => p.x === 400)!;
			for (const rule of RULES) expect(at400.rules[rule].mean_observed_lift).toBe(headline.rules[rule].mean_observed_lift);
		});

		it("more traffic shrinks every rule's inflation toward the truth", () => {
			for (const rule of RULES) {
				const lifts = sweep.points.map((p) => p.rules[rule].mean_observed_lift!);
				for (let i = 1; i < lifts.length; i++) expect(lifts[i]).toBeLessThanOrEqual(lifts[i - 1]);
				expect(lifts[lifts.length - 1]).toBeLessThan(trueEffect(CURSE_CONFIG).lift + 0.01);
			}
		});

		it("at every traffic level, a stricter rule's winners are at least as inflated", () => {
			for (const p of sweep.points) {
				for (let i = 1; i < RULES.length; i++) {
					expect(p.rules[RULES[i]].mean_observed_lift!).toBeGreaterThanOrEqual(p.rules[RULES[i - 1]].mean_observed_lift!);
				}
			}
		});
	});

	describe("number of metrics", () => {
		const sweep = runCurseStudy("num_metrics", STUDY_METRIC_COUNTS);

		it("pins every point", () => {
			expectPoints(sweep, [
				[2, 0.6335, 0.7805, 0.8229, 0.8257, 2100, 1834, 1820],
				[5, 0.6497, 0.79, 0.9035, 0.9083, 2153, 1498, 1477],
				[10, 0.6307, 0.7713, 0.892, 0.952, 6384, 4225, 3406],
				[20, 0.6405, 0.7782, 0.9083, 1.0117, 12922, 8262, 5596],
				[30, 0.6393, 0.7767, 0.9102, 1.0426, 19395, 12188, 7270],
				[50, 0.6363, 0.7755, 0.917, 1.0911, 32163, 19738, 9810],
			]);
		});

		it("Bonferroni's inflation climbs with every metric added, while no correction's stays put", () => {
			const bonferroni = sweep.points.map((p) => p.rules.bonferroni.mean_observed_lift!);
			for (let i = 1; i < bonferroni.length; i++) expect(bonferroni[i]).toBeGreaterThan(bonferroni[i - 1]);
			const none = sweep.points.map((p) => p.rules.none.mean_observed_lift!);
			expect(Math.max(...none) - Math.min(...none)).toBeLessThan(0.03);
		});
	});
});

describe("collectObservations and summarizeObservations", () => {
	const observations = collectObservations({ firstSeed: 1, dashboards: 200 });
	const tally = measureWinnersCurse({ firstSeed: 1, dashboards: 200 });

	it("returns every metric of every dashboard", () => {
		expect(observations).toHaveLength(200 * 20);
		expect(observations.filter((o) => !o.is_null)).toHaveLength(200 * 6);
	});

	it("summarizes to exactly what measureWinnersCurse tallies over the same seeds", () => {
		for (const rule of RULES as Rule[]) {
			const s = summarizeObservations(observations, rule);
			expect(s.flags).toBe(tally.rules[rule].flags);
			expect(s.null_flags).toBe(tally.rules[rule].null_flags);
			expect(s.lifted_flags).toBe(tally.rules[rule].lifted_flags);
			expect(s.mean_lift_flagged).toBeCloseTo(tally.rules[rule].mean_observed_lift!, 12);
			expect(s.mean_retest_flagged).toBeCloseTo(tally.rules[rule].mean_retest_lift!, 12);
			expect(s.mean_lift_all).toBeCloseTo(tally.mean_observed_lift_all!, 12);
		}
	});
});

describe("formatters", () => {
	it("formats lifts, shares and counts the way the page prints them", async () => {
		const { formatLift, formatShare, formatCount } = await import("../../src/lib/stats-sim/winners-curse");
		expect(formatLift(1.0117)).toBe("+101%");
		expect(formatLift(0.6405)).toBe("+64%");
		expect(formatLift(-0.12)).toBe("−12%");
		expect(formatLift(-0.001)).toBe("+0%");
		expect(formatLift(null)).toBe("—");
		expect(formatShare(0.1384)).toBe("13.8%");
		expect(formatShare(null)).toBe("—");
		expect(formatCount(14998)).toBe("14,998");
	});
});
