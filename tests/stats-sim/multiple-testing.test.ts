import { describe, expect, it } from "vitest";
import { benjaminiHochberg, bonferroniRejections, bonferroniThreshold, naiveRejections } from "../../src/lib/stats-sim/multiple-testing";
import { standardNormal, mulberry32 } from "../../src/lib/stats-sim/rng";
import { standardNormalCdf } from "../../src/lib/stats-sim/frequentist";

describe("bonferroniThreshold", () => {
	it("divides alpha evenly across the number of tests", () => {
		expect(bonferroniThreshold(0.05, 20)).toBeCloseTo(0.0025, 10);
		expect(bonferroniThreshold(0.05, 1)).toBeCloseTo(0.05, 10);
	});

	it("throws for a non-positive number of tests", () => {
		expect(() => bonferroniThreshold(0.05, 0)).toThrow();
	});
});

describe("naiveRejections / bonferroniRejections", () => {
	it("bonferroni rejects a strict subset of what naive rejects, at the same alpha", () => {
		const pValues = [0.001, 0.02, 0.04, 0.06, 0.5];
		const naive = naiveRejections(pValues, 0.05);
		const bonferroni = bonferroniRejections(pValues, 0.05);
		expect(naive).toEqual([true, true, true, false, false]);
		expect(bonferroni).toEqual([true, false, false, false, false]); // threshold = 0.05/5 = 0.01
	});
});

describe("benjaminiHochberg", () => {
	it("matches a known worked example", () => {
		// A standard textbook illustration: 10 p-values, alpha = 0.05. The BH line crosses at rank 2
		// (0.01 <= 2/10*0.05 = 0.01), and nowhere higher, so exactly the two smallest get rejected.
		const pValues = [0.01, 0.01, 0.03, 0.05, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8];
		const rejections = benjaminiHochberg(pValues, 0.05);
		expect(rejections).toEqual([true, true, false, false, false, false, false, false, false, false]);
	});

	it("rejects nothing when no p-value clears its own rank's line", () => {
		const rejections = benjaminiHochberg([0.5, 0.6, 0.7], 0.05);
		expect(rejections).toEqual([false, false, false]);
	});

	it("rejects everything when every p-value is far below alpha/m", () => {
		const rejections = benjaminiHochberg([0.0001, 0.0002, 0.0003], 0.05);
		expect(rejections).toEqual([true, true, true]);
	});
});

describe("false-positive behavior under the null, via direct Monte Carlo on p-values", () => {
	const alpha = 0.05;
	const trials = 3000;

	function simulateNullPValues(m: number, rng: () => number): number[] {
		return Array.from({ length: m }, () => rng());
	}

	it("naive family-wise error rate matches 1 - (1-alpha)^m", () => {
		const rng = mulberry32(1);
		for (const m of [5, 20]) {
			let atLeastOneFalsePositive = 0;
			for (let t = 0; t < trials; t++) {
				const pValues = simulateNullPValues(m, rng);
				if (naiveRejections(pValues, alpha).some(Boolean)) atLeastOneFalsePositive++;
			}
			const observedFwer = atLeastOneFalsePositive / trials;
			const expectedFwer = 1 - Math.pow(1 - alpha, m);
			expect(observedFwer).toBeCloseTo(expectedFwer, 1);
		}
	});

	it("bonferroni's family-wise error rate stays near alpha regardless of m", () => {
		const rng = mulberry32(2);
		for (const m of [5, 20, 50]) {
			let atLeastOneFalsePositive = 0;
			for (let t = 0; t < trials; t++) {
				const pValues = simulateNullPValues(m, rng);
				if (bonferroniRejections(pValues, alpha).some(Boolean)) atLeastOneFalsePositive++;
			}
			const observedFwer = atLeastOneFalsePositive / trials;
			expect(observedFwer).toBeGreaterThan(0.02);
			expect(observedFwer).toBeLessThan(0.09);
		}
	});

	it("BH's expected false discovery rate stays at or below alpha, mixing true nulls and true effects", () => {
		// Simulate p-values directly rather than a full experiment: null metrics get p ~ Uniform(0,1)
		// (an exact, standard fact about p-values under the null), non-null metrics get a p-value
		// from a z-test with a real 2.5-SE effect (z ~ Normal(2.5, 1)), skewed toward small p but not
		// certain to be significant, a realistic mix.
		const rng = mulberry32(3);
		const m = 20;
		const fractionNull = 0.7;
		const numNull = Math.round(m * fractionNull);
		let fdrSum = 0;
		let trialsWithRejections = 0;
		let truePositivesFound = 0;
		let totalTruePositives = 0;

		for (let t = 0; t < trials; t++) {
			const isNull = Array.from({ length: m }, (_, i) => i < numNull);
			const pValues = isNull.map((null_) => {
				if (null_) return rng();
				const z = 2.5 + standardNormal(rng);
				return 2 * (1 - standardNormalCdf(Math.abs(z)));
			});
			const rejections = benjaminiHochberg(pValues, alpha);
			const totalRejections = rejections.filter(Boolean).length;
			const falseRejections = rejections.filter((r, i) => r && isNull[i]).length;
			if (totalRejections > 0) {
				fdrSum += falseRejections / totalRejections;
				trialsWithRejections++;
			}
			truePositivesFound += rejections.filter((r, i) => r && !isNull[i]).length;
			totalTruePositives += isNull.filter((n) => !n).length;
		}

		const observedFdr = fdrSum / trials; // trials with 0 rejections contribute 0, per the standard FDR convention
		expect(observedFdr).toBeLessThanOrEqual(alpha + 0.02);
		expect(trialsWithRejections).toBeGreaterThan(0);
		expect(truePositivesFound / totalTruePositives).toBeGreaterThan(0.3); // BH still has real power to detect the genuine effects
	});

	it("BH detects more true effects than Bonferroni at the same alpha, as m grows", () => {
		const rng = mulberry32(4);
		const m = 30;
		const numNull = 24;
		let bhTruePositives = 0;
		let bonferroniTruePositives = 0;
		const totalTruePositivesPerTrial = m - numNull;

		for (let t = 0; t < trials; t++) {
			const isNull = Array.from({ length: m }, (_, i) => i < numNull);
			const pValues = isNull.map((null_) => {
				if (null_) return rng();
				const z = 2.2 + standardNormal(rng);
				return 2 * (1 - standardNormalCdf(Math.abs(z)));
			});
			const bhRejections = benjaminiHochberg(pValues, alpha);
			const bonferroniRej = bonferroniRejections(pValues, alpha);
			bhTruePositives += bhRejections.filter((r, i) => r && !isNull[i]).length;
			bonferroniTruePositives += bonferroniRej.filter((r, i) => r && !isNull[i]).length;
		}

		expect(bhTruePositives).toBeGreaterThan(bonferroniTruePositives);
		void totalTruePositivesPerTrial;
	});
});
