import { describe, expect, it } from "vitest";
import {
	computeWhaleLiftMultiplier,
	percentileThreshold,
	sampleArmBRevenueTailConcentrated,
	sampleArmBRevenueUniform,
	sampleHurdleRevenue,
	trimValues,
	winsorizeValues,
} from "../../src/lib/stats-sim/outlier-handling";
import { logNormalMeanVariance } from "../../src/lib/stats-sim/revenue";
import { mulberry32 } from "../../src/lib/stats-sim/rng";

function mean(values: number[]): number {
	return values.reduce((s, v) => s + v, 0) / values.length;
}

describe("percentileThreshold / winsorizeValues / trimValues", () => {
	it("finds the exact nearest-rank percentile on a known array", () => {
		const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
		expect(percentileThreshold(values, 0.9)).toBe(90);
		expect(percentileThreshold(values, 0.5)).toBe(50);
		expect(percentileThreshold(values, 1)).toBe(100);
	});

	it("winsorizeValues caps values above the threshold and leaves the rest untouched", () => {
		const values = [1, 5, 9, 100, 3];
		const result = winsorizeValues(values, 9);
		expect(result).toEqual([1, 5, 9, 9, 3]);
		expect(result).toHaveLength(values.length);
	});

	it("trimValues drops values above the threshold entirely", () => {
		const values = [1, 5, 9, 100, 3];
		const result = trimValues(values, 9);
		expect(result).toEqual([1, 5, 9, 3]);
		expect(result).toHaveLength(4);
	});
});

describe("sampleHurdleRevenue", () => {
	it("matches the spend rate and per-spender mean over many draws", () => {
		const rng = mulberry32(1);
		const spendRate = 0.3;
		const mu = 3;
		const sigma = 1.2;
		const draws: number[] = [];
		for (let i = 0; i < 50000; i++) draws.push(sampleHurdleRevenue(spendRate, mu, sigma, rng));

		const zeroFraction = draws.filter((d) => d === 0).length / draws.length;
		expect(zeroFraction).toBeCloseTo(1 - spendRate, 1);

		const nonZero = draws.filter((d) => d > 0);
		const { mean: expectedMean } = logNormalMeanVariance(mu, sigma);
		expect(mean(nonZero)).toBeCloseTo(expectedMean, -1);
	});
});

describe("computeWhaleLiftMultiplier / sampleArmBRevenueUniform / sampleArmBRevenueTailConcentrated", () => {
	it("calibrates uniform and tail-concentrated lifts to the same overall dollar lift", () => {
		const spendRate = 0.3;
		const mu = 3;
		const sigma = 1.2;
		const targetRelativeLift = 0.2;
		const whaleFraction = 0.05;
		const n = 200000;

		const rngA = mulberry32(2);
		const baseline: number[] = [];
		for (let i = 0; i < n; i++) baseline.push(sampleHurdleRevenue(spendRate, mu, sigma, rngA));
		const baselineMean = mean(baseline);

		const rngUniform = mulberry32(3);
		const uniform: number[] = [];
		for (let i = 0; i < n; i++) uniform.push(sampleArmBRevenueUniform(spendRate, mu, sigma, targetRelativeLift, rngUniform));

		const whaleMultiplier = computeWhaleLiftMultiplier(spendRate, mu, sigma, targetRelativeLift, whaleFraction);
		const rngTail = mulberry32(4);
		const tailConcentrated: number[] = [];
		for (let i = 0; i < n; i++) {
			tailConcentrated.push(sampleArmBRevenueTailConcentrated(spendRate, mu, sigma, whaleFraction, whaleMultiplier, rngTail));
		}

		const uniformLift = mean(uniform) - baselineMean;
		const tailConcentratedLift = mean(tailConcentrated) - baselineMean;
		const expectedLift = targetRelativeLift * baselineMean;

		expect(uniformLift).toBeCloseTo(expectedLift, 0);
		expect(tailConcentratedLift).toBeCloseTo(expectedLift, 0);
	});

	it("is deterministic for a fixed seed", () => {
		const rng1 = mulberry32(10);
		const rng2 = mulberry32(10);
		const a = sampleArmBRevenueUniform(0.3, 3, 1.2, 0.2, rng1);
		const b = sampleArmBRevenueUniform(0.3, 3, 1.2, 0.2, rng2);
		expect(a).toBe(b);
	});
});
