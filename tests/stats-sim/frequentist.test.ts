import { describe, expect, it } from "vitest";
import { standardNormalCdf, twoProportionZTest } from "../../src/lib/stats-sim/frequentist";

describe("standardNormalCdf", () => {
	it("matches known reference values", () => {
		expect(standardNormalCdf(0)).toBeCloseTo(0.5, 4);
		expect(standardNormalCdf(1.96)).toBeCloseTo(0.975, 3);
		expect(standardNormalCdf(-1.96)).toBeCloseTo(0.025, 3);
		expect(standardNormalCdf(2.576)).toBeCloseTo(0.995, 3);
	});
});

describe("twoProportionZTest", () => {
	it("matches a known textbook two-proportion example", () => {
		// 45/100 vs 60/100: pooled p = 0.525, SE = sqrt(0.525*0.475*(1/100+1/100)) ≈ 0.0706,
		// z = (0.60 - 0.45) / 0.0706 ≈ 2.124, two-sided p ≈ 0.0337.
		const result = twoProportionZTest(45, 100, 60, 100);
		expect(result.z).toBeCloseTo(2.124, 2);
		expect(result.p_value).toBeCloseTo(0.0337, 3);
	});

	it("returns p close to 1 when there is no real difference", () => {
		const result = twoProportionZTest(50, 100, 50, 100);
		expect(result.z).toBeCloseTo(0, 6);
		expect(result.p_value).toBeCloseTo(1, 6);
	});

	it("returns null z/p when either arm has zero trials", () => {
		const result = twoProportionZTest(0, 0, 5, 10);
		expect(result.z).toBeNull();
		expect(result.p_value).toBeNull();
	});

	it("returns null z/p when pooled variance is degenerate (0/0 successes both arms)", () => {
		const result = twoProportionZTest(0, 10, 0, 10);
		expect(result.z).toBeNull();
		expect(result.p_value).toBeNull();
	});

	it("is symmetric: swapping which arm is higher flips the sign of z but not p", () => {
		const ab = twoProportionZTest(45, 100, 60, 100);
		const ba = twoProportionZTest(60, 100, 45, 100);
		expect(ab.z).toBeCloseTo(-(ba.z as number), 6);
		expect(ab.p_value).toBeCloseTo(ba.p_value as number, 6);
	});
});
