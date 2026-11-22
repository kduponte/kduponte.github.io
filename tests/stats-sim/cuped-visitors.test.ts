import { describe, expect, it } from "vitest";
import { simulateCupedVisitors } from "../../src/lib/stats-sim/cuped-visitors";
import { HERO_SEED, LIVE_EXPERIMENT_DEFAULTS } from "../../src/lib/stats-sim/cuped-defaults";
import { runCupedExperiment, type CupedExperimentConfig } from "../../src/lib/stats-sim/cuped-experiment";

const HERO: CupedExperimentConfig = { ...LIVE_EXPERIMENT_DEFAULTS, seed: HERO_SEED };

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

describe("simulateCupedVisitors", () => {
	it("draws the exact visitors runCupedExperiment analyzes, day by day", () => {
		const config: CupedExperimentConfig = { ...HERO, seed: 77, days: 6 };
		const visitors = simulateCupedVisitors(config);
		const experiment = runCupedExperiment(config);
		for (const snap of experiment.days) {
			const soFar = visitors.filter((v) => v.day <= snap.day);
			expect(mean(soFar.filter((v) => v.arm === "A").map((v) => v.y))).toBeCloseTo(snap.raw_mean_a, 10);
			expect(mean(soFar.filter((v) => v.arm === "B").map((v) => v.y))).toBeCloseTo(snap.raw_mean_b, 10);
		}
	});

	it("has visitors_per_day visitors per arm per day", () => {
		const visitors = simulateCupedVisitors(HERO);
		expect(visitors).toHaveLength(2 * HERO.visitors_per_day * HERO.days);
		for (let day = 1; day <= HERO.days; day++) {
			expect(visitors.filter((v) => v.day === day && v.arm === "A")).toHaveLength(HERO.visitors_per_day);
			expect(visitors.filter((v) => v.day === day && v.arm === "B")).toHaveLength(HERO.visitors_per_day);
		}
	});
});
