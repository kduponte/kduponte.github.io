import { describe, expect, it } from "vitest";
import { describeRun, formatLift, formatP, formatZ } from "../../src/lib/stats-sim/dashboard-readout";
import { runGaugeDashboard } from "../../src/lib/stats-sim/dashboard-runs";

const run = runGaugeDashboard(1);

describe("formatZ / formatP", () => {
	it("signs z with a real minus", () => {
		expect(formatZ(-2.416)).toBe("−2.42");
		expect(formatZ(1.5)).toBe("+1.50");
	});

	it("rounds lifts to whole signed percents", () => {
		expect(formatLift(0.7332)).toBe("+73%");
		expect(formatLift(-0.389)).toBe("−39%");
	});

	it("keeps tiny p-values honest", () => {
		expect(formatP(0.00001)).toBe("<0.0001");
		expect(formatP(0.0161)).toBe("0.0161");
	});
});

describe("describeRun", () => {
	it("names what crossed uncorrected, including the false discovery", () => {
		const r = describeRun(run, "none", 0, 20);
		expect(r.eyebrow).toBe("Run 1 of 20 · seed 1");
		expect(r.crossed).toHaveLength(6);
		expect(r.falseCount).toBe(1);
		expect(r.crossed.find((c) => c.is_null)?.number).toBe(9);
		expect(r.redline).toBe("|z| > 1.96, so p < 0.05");
		expect(r.sentence).toContain("#9 is truly null");
	});

	it("states Bonferroni's split and BH's rank", () => {
		expect(describeRun(run, "bonferroni", 0, 20).redline).toBe("|z| > 3.02, so p < 0.05 ÷ 20 = 0.0025");
		const bh = describeRun(run, "bh", 0, 20);
		expect(bh.redline).toBe(`|z| ≥ ${run.redline.bh.z.toFixed(2)}, so p ≤ 3/20 × 0.05 = 0.0075`);
		expect(bh.falseCount).toBe(0);
		expect(bh.sentence).toContain("no false discoveries");
	});

	it("lists the real lifts a rule leaves out of the red", () => {
		const r = describeRun(run, "bonferroni", 0, 20);
		expect(r.missed.every((m) => !m.is_null)).toBe(true);
		expect(r.missed.length + r.crossed.filter((c) => !c.is_null).length).toBe(6);
	});

	it("counts several false discoveries in the sentence", () => {
		const r = describeRun(runGaugeDashboard(3), "bh", 2, 20);
		expect(r.falseCount).toBe(2);
		expect(r.sentence).toContain("Seed 3, Benjamini-Hochberg: 7 of 20 needles in the red");
		expect(r.sentence).toContain("#2, #10 are truly null, 2 false discoveries.");
	});

	it("states the winner's curse for the real lifts in the red, under each rule", () => {
		expect(describeRun(run, "none", 0, 20).curse).toBe(
			"Winner's curse: the 5 real lifts in the red read +73% on average, against a true +60% (all 6 average +59%).",
		);
		expect(describeRun(run, "bonferroni", 0, 20).curse).toBe(
			"Winner's curse: the 2 real lifts in the red read +96% on average, against a true +60% (all 6 average +59%).",
		);
		expect(describeRun(run, "bh", 0, 20).curse).toContain("the 3 real lifts in the red read +86% on average");
	});

	it("says so when no real lift is in the red", () => {
		const r = describeRun(runGaugeDashboard(2), "bonferroni", 1, 20);
		expect(r.curse).toMatch(/^No real lift is in the red, so no winner is overstated \(all 6 average [+−]\d+%\); the truth is \+60%\.$/);
	});

	it("explains a BH run that flags nothing", () => {
		const r = describeRun(runGaugeDashboard(6), "bh", 5, 20);
		expect(r.crossed).toHaveLength(0);
		expect(r.rule).toContain("nothing is flagged");
		expect(r.redline).toContain("1/20 × 0.05");
	});
});
