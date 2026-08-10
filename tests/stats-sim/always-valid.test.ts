import { describe, expect, it } from "vitest";
import { alwaysValidLikelihoodRatio, alwaysValidPValue, alwaysValidTest, defaultTau2 } from "../../src/lib/stats-sim/always-valid";
import { binomial, mulberry32 } from "../../src/lib/stats-sim/rng";

describe("alwaysValidLikelihoodRatio", () => {
	it("matches hand-computed reference values", () => {
		expect(alwaysValidLikelihoodRatio(0.05, 0.01, 0.01)).toBeCloseTo(0.7527112504363233, 10);
		expect(alwaysValidLikelihoodRatio(0, 0.01, 0.01)).toBeCloseTo(0.7071067811865476, 10);
	});

	it("equals sqrt(V/(V+tau2)) exactly when delta_hat is 0 (no observed effect, no evidence either way)", () => {
		const v = 0.02;
		const tau2 = 0.005;
		expect(alwaysValidLikelihoodRatio(0, v, tau2)).toBeCloseTo(Math.sqrt(v / (v + tau2)), 10);
	});

	it("approaches 1 as tau2 shrinks toward 0 (an infinitely skeptical prior sees no evidence either way)", () => {
		const lr = alwaysValidLikelihoodRatio(0.05, 0.01, 1e-8);
		expect(lr).toBeCloseTo(1, 3);
	});

	it("approaches 0 as tau2 grows large for a fixed, modest observed effect (a test tuned for huge effects can't accumulate evidence from modest data)", () => {
		const small = alwaysValidLikelihoodRatio(0.05, 0.01, 0.01);
		const large = alwaysValidLikelihoodRatio(0.05, 0.01, 1000);
		expect(large).toBeLessThan(small);
		expect(large).toBeLessThan(0.05);
	});

	it("throws for non-positive variance or tau2", () => {
		expect(() => alwaysValidLikelihoodRatio(0.05, 0, 0.01)).toThrow();
		expect(() => alwaysValidLikelihoodRatio(0.05, -1, 0.01)).toThrow();
		expect(() => alwaysValidLikelihoodRatio(0.05, 0.01, 0)).toThrow();
	});
});

describe("alwaysValidPValue", () => {
	it("is min(1, 1/likelihoodRatio)", () => {
		expect(alwaysValidPValue(2)).toBeCloseTo(0.5, 10);
		expect(alwaysValidPValue(10)).toBeCloseTo(0.1, 10);
		expect(alwaysValidPValue(0.5)).toBeCloseTo(1, 10); // 1/0.5 = 2, clamped to 1
	});

	it("clamps to at most 1 even when the likelihood ratio is very small", () => {
		expect(alwaysValidPValue(0.001)).toBe(1);
	});
});

describe("defaultTau2", () => {
	it("scales with the baseline rate and the relative-effect-size parameter", () => {
		const tau2a = defaultTau2(0.1, 0.3);
		const tau2b = defaultTau2(0.2, 0.3);
		expect(tau2b).toBeGreaterThan(tau2a);
		expect(Math.sqrt(tau2a)).toBeCloseTo(0.3 * 0.1, 10);
	});

	it("stays positive even for a zero or negative baseline rate", () => {
		expect(defaultTau2(0)).toBeGreaterThan(0);
		expect(defaultTau2(-0.1)).toBeGreaterThan(0);
	});
});

describe("alwaysValidTest", () => {
	it("returns null fields when either arm has zero trials", () => {
		const result = alwaysValidTest(0, 0, 5, 10, 0.01);
		expect(result.likelihood_ratio).toBeNull();
		expect(result.p_value).toBeNull();
	});

	it("computes delta_hat as rateB - rateA", () => {
		const result = alwaysValidTest(45, 100, 60, 100, defaultTau2(0.45));
		expect(result.delta_hat).toBeCloseTo(0.15, 10);
		expect(result.likelihood_ratio).not.toBeNull();
		expect(result.p_value).not.toBeNull();
	});

	it("gives a small p-value for a large, well-supported observed effect", () => {
		// A huge, obvious difference with a lot of data on each side.
		const result = alwaysValidTest(200, 1000, 500, 1000, defaultTau2(0.2));
		expect(result.p_value).not.toBeNull();
		expect(result.p_value as number).toBeLessThan(0.01);
	});

	it("gives a p-value close to 1 when there is no observed difference", () => {
		const result = alwaysValidTest(100, 1000, 100, 1000, defaultTau2(0.1));
		expect(result.p_value).not.toBeNull();
		expect(result.p_value as number).toBeGreaterThan(0.9);
	});
});

describe("martingale sanity: E[Lambda] stays near 1 under the null", () => {
	it("averages close to 1 across many independent single-look draws with no true difference", () => {
		// Lambda has expectation exactly 1 under H0 by construction, but is a genuinely
		// heavy-tailed statistic (it's a likelihood ratio), so this needs many trials and a loose
		// tolerance — the point is order-of-magnitude sanity, not tight convergence. The real,
		// decisive validation (any-day crossing rate tracking alpha across a full sequential
		// simulation) lives in peeking-study.test.ts.
		const rng = mulberry32(42);
		const trueRate = 0.1;
		const n = 500;
		const trials = 20000;
		const tau2 = defaultTau2(trueRate);

		let sum = 0;
		let counted = 0;
		for (let i = 0; i < trials; i++) {
			const successesA = binomial(n, trueRate, rng);
			const successesB = binomial(n, trueRate, rng);
			const result = alwaysValidTest(successesA, n, successesB, n, tau2);
			if (result.likelihood_ratio !== null) {
				sum += result.likelihood_ratio;
				counted++;
			}
		}
		const mean = sum / counted;
		expect(mean).toBeGreaterThan(0.5);
		expect(mean).toBeLessThan(2);
	});
});
