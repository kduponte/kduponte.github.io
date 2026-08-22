import { describe, expect, it } from "vitest";
import { cupedAdjustedValue, estimateTheta, simulateCorrelatedPair, varianceReductionFactor, type XYPair } from "../../src/lib/stats-sim/cuped";
import { mulberry32 } from "../../src/lib/stats-sim/rng";

function mean(values: number[]): number {
	return values.reduce((s, v) => s + v, 0) / values.length;
}

function variance(values: number[]): number {
	const m = mean(values);
	return values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length;
}

describe("simulateCorrelatedPair", () => {
	it("produces pairs with approximately the target correlation", () => {
		const rng = mulberry32(42);
		for (const correlation of [0.3, 0.5, 0.8]) {
			const pairs: XYPair[] = [];
			for (let i = 0; i < 20000; i++) pairs.push(simulateCorrelatedPair(100, 20, correlation, rng));
			const xMean = mean(pairs.map((p) => p.x));
			const yMean = mean(pairs.map((p) => p.y));
			let cov = 0;
			let varX = 0;
			let varY = 0;
			for (const p of pairs) {
				cov += (p.x - xMean) * (p.y - yMean);
				varX += (p.x - xMean) * (p.x - xMean);
				varY += (p.y - yMean) * (p.y - yMean);
			}
			const observedCorrelation = cov / Math.sqrt(varX * varY);
			expect(observedCorrelation).toBeCloseTo(correlation, 1);
		}
	});
});

describe("estimateTheta", () => {
	it("recovers approximately correlation * ySd (since x has unit variance)", () => {
		const rng = mulberry32(7);
		const ySd = 20;
		const correlation = 0.6;
		const pairs: XYPair[] = [];
		for (let i = 0; i < 20000; i++) pairs.push(simulateCorrelatedPair(100, ySd, correlation, rng));
		const theta = estimateTheta(pairs);
		expect(theta).toBeCloseTo(correlation * ySd, 0);
	});

	it("returns 0 when x has no variance", () => {
		const pairs: XYPair[] = [
			{ x: 5, y: 1 },
			{ x: 5, y: 2 },
			{ x: 5, y: 3 },
		];
		expect(estimateTheta(pairs)).toBe(0);
	});
});

describe("cupedAdjustedValue / varianceReductionFactor", () => {
	it("does not shift the mean (unbiasedness)", () => {
		const rng = mulberry32(11);
		const yMean = 100;
		const ySd = 20;
		const correlation = 0.7;
		const pairs: XYPair[] = [];
		for (let i = 0; i < 20000; i++) pairs.push(simulateCorrelatedPair(yMean, ySd, correlation, rng));
		const xMean = mean(pairs.map((p) => p.x));
		const theta = estimateTheta(pairs);
		const adjusted = pairs.map((p) => cupedAdjustedValue(p.y, p.x, xMean, theta));
		expect(mean(adjusted)).toBeCloseTo(yMean, 0);
	});

	it("reduces variance by exactly the documented factor (1 - correlation^2)", () => {
		const rng = mulberry32(99);
		const yMean = 100;
		const ySd = 20;
		for (const correlation of [0.3, 0.5, 0.8, 0.95]) {
			const pairs: XYPair[] = [];
			for (let i = 0; i < 30000; i++) pairs.push(simulateCorrelatedPair(yMean, ySd, correlation, rng));
			const xMean = mean(pairs.map((p) => p.x));
			const theta = estimateTheta(pairs);
			const adjusted = pairs.map((p) => cupedAdjustedValue(p.y, p.x, xMean, theta));

			const rawVariance = variance(pairs.map((p) => p.y));
			const adjustedVariance = variance(adjusted);
			const observedReduction = adjustedVariance / rawVariance;
			const expectedReduction = varianceReductionFactor(correlation);
			expect(observedReduction).toBeCloseTo(expectedReduction, 1);
		}
	});
});
