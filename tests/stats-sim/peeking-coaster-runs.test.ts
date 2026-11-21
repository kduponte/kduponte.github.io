import { describe, expect, it } from "vitest";
import { buildCoasterData, summarizeRun } from "../../src/lib/stats-sim/peeking-coaster-runs";
import { runPeekingStudy } from "../../src/lib/stats-sim/peeking-study";
import { defaultPeekingStudyConfig } from "../../src/lib/stats-sim/peeking-study-defaults";

describe("summarizeRun", () => {
	it("finds the first peek under alpha, every fresh dip, the end and the low", () => {
		const r = summarizeRun(0, 7, [0.4, 0.04, 0.03, 0.2, 0.05, 0.01, 0.3], 0.05);
		expect(r.firstCrossing).toEqual({ day: 2, p: 0.04 });
		expect(r.dipDays).toEqual([2, 6]); // p = 0.05 exactly is not under alpha
		expect(r.final).toEqual({ day: 7, p: 0.3 });
		expect(r.low).toEqual({ day: 6, p: 0.01 });
	});

	it("counts a run that starts under alpha as dipping on day 1", () => {
		const r = summarizeRun(0, 1, [0.01, 0.2], 0.05);
		expect(r.firstCrossing?.day).toBe(1);
		expect(r.dipDays).toEqual([1]);
	});

	it("reports no crossing for a run that stays over alpha", () => {
		const r = summarizeRun(0, 1, [0.5, 0.06, 0.9], 0.05);
		expect(r.firstCrossing).toBeNull();
		expect(r.dipDays).toEqual([]);
	});
});

describe("buildCoasterData", () => {
	// A small study keeps the test quick; the runs themselves don't depend on its size.
	const data = buildCoasterData({ studyTrials: 60 });

	it("uses the page's peeking-study defaults: revenue per user, 30 daily peeks, alpha 0.05", () => {
		expect(data.config.metric_type).toBe("revenue");
		expect(data.config.visitors_per_day).toBe(500_000);
		expect(data.config.true_rate).toBe(0.01);
		expect(data.days).toBe(30);
		expect(data.alpha).toBe(0.05);
		expect(data.runs).toHaveLength(20);
		data.runs.forEach((r, i) => {
			expect(r.seed).toBe(1 + i);
			expect(r.p).toHaveLength(30);
		});
	});

	it("replays the study's own trials: the same runs cross, on the same days", () => {
		const study = runPeekingStudy(defaultPeekingStudyConfig(1, 20));
		expect(data.crossedCount / 20).toBeCloseTo(study.frequentist_any_day_rate, 12);
		expect(data.finalCount / 20).toBeCloseTo(study.frequentist_final_day_rate, 12);
		const days = data.runs.filter((r) => r.firstCrossing).map((r) => r.firstCrossing!.day);
		expect(days).toEqual(study.first_crossing_days_frequentist);
	});

	it("is reproducible", () => {
		const again = buildCoasterData({ studyTrials: 60 });
		expect(again.runs.map((r) => r.p)).toEqual(data.runs.map((r) => r.p));
	});

	it("accumulates crossings by day up to the total", () => {
		expect(data.crossedByDay).toHaveLength(30);
		for (let i = 1; i < 30; i++) expect(data.crossedByDay[i]).toBeGreaterThanOrEqual(data.crossedByDay[i - 1]);
		expect(data.crossedByDay[29]).toBe(data.crossedCount);
	});

	it("pins the published hero numbers (seed 1): 4 of 20 runs dip under 0.05, run 1 first on day 18", () => {
		expect(data.crossedCount).toBe(4);
		expect(data.finalCount).toBe(1);
		const first = data.runs[0];
		expect(first.firstCrossing?.day).toBe(18);
		expect(first.firstCrossing?.p).toBeCloseTo(0.0316, 3);
		expect(first.final.p).toBeCloseTo(0.381, 2);
	});
});
