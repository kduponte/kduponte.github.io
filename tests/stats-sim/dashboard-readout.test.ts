import { describe, expect, it } from "vitest";
import { describeRun, formatLift, formatP, formatZ, listNames } from "../../src/lib/stats-sim/dashboard-readout";
import { runDashboard } from "../../src/lib/stats-sim/dashboard-runs";

const run = runDashboard(1);

describe("formatZ / formatLift / formatP / listNames", () => {
	it("signs z with a real minus", () => {
		expect(formatZ(-2.416)).toBe("−2.42");
		expect(formatZ(1.5)).toBe("+1.50");
	});

	it("rounds lifts to whole signed percents", () => {
		expect(formatLift(0.7332)).toBe("+73%");
		expect(formatLift(-0.389)).toBe("−39%");
		expect(formatLift(0)).toBe("0%");
		expect(formatLift(-0.004)).toBe("0%");
	});

	it("keeps tiny p-values honest", () => {
		expect(formatP(0.00001)).toBe("<0.0001");
		expect(formatP(0.0161)).toBe("0.0161");
	});

	it("joins names the way a sentence would", () => {
		expect(listNames([])).toBe("");
		expect(listNames(["A"])).toBe("A");
		expect(listNames(["A", "B"])).toBe("A and B");
		expect(listNames(["A", "B", "C"])).toBe("A, B and C");
	});
});

describe("describeRun", () => {
	it("says what the dashboard claims before the truth: what cleared, and which way", () => {
		const r = describeRun(run, "none", 0, 20);
		expect(r.eyebrow).toBe("Run 1 of 20 · seed 1");
		expect(r.cleared).toHaveLength(6);
		expect(r.headline).toBe("6 of 20 metrics cleared the bar: 5 up, 1 down.");
		expect(r.bar).toBe("p < 0.05 (|z| > 1.96)");
	});

	it("names the false discovery once revealed", () => {
		const r = describeRun(run, "none", 0, 20);
		const fake = run.metrics[8];
		expect(fake.is_null).toBe(true);
		expect(r.falseCount).toBe(1);
		expect(r.truth).toBe(`1 false discovery: ${fake.name} (−39%) never truly moved.`);
	});

	it("states Bonferroni's split and BH's rank", () => {
		expect(describeRun(run, "bonferroni", 0, 20).bar).toBe("p < 0.05 ÷ 20 = 0.0025 (|z| > 3.02)");
		const bh = describeRun(run, "bh", 0, 20);
		expect(bh.bar).toBe(`p ≤ 3/20 × 0.05 = 0.0075 (|z| ≥ ${run.bar.bh.z.toFixed(2)})`);
		expect(bh.falseCount).toBe(0);
		expect(bh.truth).toBe("No false discoveries: all 3 metrics that cleared the bar truly moved.");
		expect(describeRun(run, "bonferroni", 0, 20).truth).toBe("No false discoveries: both metrics that cleared the bar truly moved.");
	});

	it("lists the real lifts a rule misses", () => {
		const r = describeRun(run, "bonferroni", 0, 20);
		expect(r.missed.every((m) => !m.is_null)).toBe(true);
		expect(r.missed.length + r.cleared.filter((c) => !c.is_null).length).toBe(6);
		expect(r.missedLine).toMatch(/^Real lifts the bar missed: .+ and .+\.$/);
		expect(describeRun(runDashboard(5), "none", 4, 20).missedLine).toMatch(/^(Real lifts the bar missed: .+\.|The bar caught every real lift\.)$/);
	});

	it("counts several false discoveries", () => {
		const r = describeRun(runDashboard(3), "none", 2, 20);
		expect(r.headline).toBe("7 of 20 metrics cleared the bar: all up.");
		expect(r.falseCount).toBe(2);
		expect(r.truth).toMatch(/^2 false discoveries: .+ \(\+\d+%\) and .+ \(\+\d+%\) never truly moved\.$/);
	});

	it("states the winner's curse for the real lifts that cleared, under each rule", () => {
		expect(describeRun(run, "none", 0, 20).curse).toBe(
			"Winner's curse: the 5 real lifts that cleared the bar read +73% on average, against a true +60% (all 6 real lifts average +59%).",
		);
		expect(describeRun(run, "bonferroni", 0, 20).curse).toBe(
			"Winner's curse: the 2 real lifts that cleared the bar read +96% on average, against a true +60% (all 6 real lifts average +59%).",
		);
		expect(describeRun(run, "bh", 0, 20).curse).toContain("the 3 real lifts that cleared the bar read +86% on average");
	});

	it("says so when no real lift clears", () => {
		const r = describeRun(runDashboard(2), "bonferroni", 1, 20);
		expect(r.curse).toMatch(/^No real lift cleared the bar, so none is overstated \(all 6 real lifts average [+−]\d+%\); the truth is \+60%\.$/);
	});

	it("explains a BH run that flags nothing", () => {
		const r = describeRun(runDashboard(6), "bh", 5, 20);
		expect(r.cleared).toHaveLength(0);
		expect(r.headline).toBe("None of the 20 metrics cleared the bar.");
		expect(r.truth).toBe("Nothing cleared the bar, so there are no false discoveries.");
		expect(r.rule).toContain("nothing clears the bar");
		expect(r.bar).toContain("1/20 × 0.05");
	});
});
