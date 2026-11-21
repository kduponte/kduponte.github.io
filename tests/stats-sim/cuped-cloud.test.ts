import { describe, expect, it } from "vitest";
import {
	buildCupedCloud,
	postAxisPosition,
	postAxisTicks,
	postValueAt,
	simulateCupedVisitors,
	varianceAt,
	writeCloudCoordinates,
} from "../../src/lib/stats-sim/cuped-cloud";
import { HERO_CUBE_SEED, LIVE_EXPERIMENT_DEFAULTS } from "../../src/lib/stats-sim/cuped-defaults";
import { varianceReductionFactor } from "../../src/lib/stats-sim/cuped";
import { runCupedExperiment, type CupedExperimentConfig } from "../../src/lib/stats-sim/cuped-experiment";

const HERO: CupedExperimentConfig = { ...LIVE_EXPERIMENT_DEFAULTS, seed: HERO_CUBE_SEED };

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const variance = (v: number[]) => {
	const m = mean(v);
	return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
};

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

describe("buildCupedCloud (the hero run)", () => {
	const cloud = buildCupedCloud(HERO);

	it("uses the live experiment's default settings", () => {
		expect(cloud.config.correlation).toBe(0.75);
		expect(cloud.config.visitors_per_day).toBe(30);
		expect(cloud.config.days).toBe(20);
		expect(cloud.countA).toBe(600);
		expect(cloud.countB).toBe(600);
	});

	it("adjusts exactly as the experiment's final day does", () => {
		const final = runCupedExperiment(HERO).days.at(-1)!;
		const adjA = cloud.yAdjusted.filter((_, i) => cloud.visitors[i].arm === "A");
		const adjB = cloud.yAdjusted.filter((_, i) => cloud.visitors[i].arm === "B");
		expect(mean(adjA)).toBeCloseTo(final.cuped_mean_a, 10);
		expect(mean(adjB)).toBeCloseTo(final.cuped_mean_b, 10);
	});

	it("shrinks the variance by exactly (1 - correlation^2), so the SD by its square root", () => {
		expect(cloud.variance.raw).toBeCloseTo(variance(cloud.visitors.map((v) => v.y)), 9);
		expect(cloud.variance.adjusted).toBeCloseTo(variance(cloud.yAdjusted), 9);
		expect(cloud.variance.adjusted / cloud.variance.raw).toBeCloseTo(varianceReductionFactor(cloud.correlation), 12);
		expect(cloud.varianceFactor).toBeCloseTo(1 - cloud.correlation ** 2, 12);
		expect(cloud.sd.adjusted / cloud.sd.raw).toBeCloseTo(Math.sqrt(1 - cloud.correlation ** 2), 12);
	});

	it("measures a sample correlation close to the set 0.75, and states the formula's prediction", () => {
		expect(Math.abs(cloud.correlation - 0.75)).toBeLessThan(0.03);
		expect(cloud.expectedVarianceFactor).toBeCloseTo(0.4375, 12);
	});

	it("pins the published numbers for seed 1", () => {
		expect(cloud.correlation.toFixed(3)).toBe("0.744");
		expect(cloud.variance.raw.toFixed(1)).toBe("405.2");
		expect(cloud.variance.adjusted.toFixed(1)).toBe("180.7");
	});

	it("keeps the adjusted mean where the raw mean was", () => {
		expect(mean(cloud.yAdjusted)).toBeCloseTo(cloud.yMean, 9);
	});

	it("falls steadily from the raw to the adjusted variance as the adjustment plays", () => {
		const n = cloud.visitors.length;
		let last = Infinity;
		for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
			const direct = variance(Array.from({ length: n }, (_, i) => postValueAt(cloud, i, t)));
			expect(varianceAt(cloud, t)).toBeCloseTo(direct, 8);
			expect(direct).toBeLessThan(last);
			last = direct;
		}
		expect(varianceAt(cloud, 0)).toBeCloseTo(cloud.variance.raw, 9);
		expect(varianceAt(cloud, 1)).toBeCloseTo(cloud.variance.adjusted, 9);
	});

	it("plots every visitor inside the cube, raw and adjusted", () => {
		const out = new Float32Array(cloud.visitors.length * 3);
		for (const t of [0, 0.5, 1]) {
			writeCloudCoordinates(cloud, t, out);
			for (const c of out) expect(Math.abs(c)).toBeLessThanOrEqual(1);
		}
		expect(cloud.halfRangeSd).toBe(4);
	});

	it("puts day 1 at the back and the last day at the front", () => {
		const out = writeCloudCoordinates(cloud, 0, new Float32Array(cloud.visitors.length * 3));
		const first = cloud.visitors.findIndex((v) => v.day === 1);
		const last = cloud.visitors.findIndex((v) => v.day === HERO.days);
		expect(out[first * 3 + 2]).toBe(-1);
		expect(out[last * 3 + 2]).toBe(1);
	});

	it("labels the post axis every 20 points across the plotted range", () => {
		expect(postAxisTicks(cloud)).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180]);
		expect(postAxisPosition(cloud, 20)).toBeCloseTo(-1, 12);
		expect(postAxisPosition(cloud, 180)).toBeCloseTo(1, 12);
	});
});
