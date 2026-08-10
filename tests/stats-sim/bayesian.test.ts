import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/lib/stats-sim/rng";
import { liftCredibleInterval, posteriorMean, priorStrengthToBetaParams, probabilityBBeatsA, updatePosterior } from "../../src/lib/stats-sim/bayesian";

describe("updatePosterior / posteriorMean", () => {
	it("moves the posterior mean toward the observed rate", () => {
		const prior = { alpha: 1, beta: 1 }; // uniform
		const posterior = updatePosterior(prior, 80, 20); // 80% observed
		expect(posteriorMean(posterior)).toBeCloseTo(81 / 102, 4);
	});

	it("a stronger prior shrinks the posterior mean toward the baseline rate, not toward 50%", () => {
		// This is exactly the case that would have caught the earlier bug (a fixed Beta(k,k)
		// prior always centered at 50%, which actively fought a low baseline rate instead of
		// expressing "skeptical that B differs from A"). Baseline is deliberately far from 0.5.
		const baselineRate = 0.1;
		const weakPrior = priorStrengthToBetaParams(0, baselineRate);
		const strongPrior = priorStrengthToBetaParams(1, baselineRate);
		const weakPosterior = updatePosterior(weakPrior, 8, 2); // small sample, 80% observed
		const strongPosterior = updatePosterior(strongPrior, 8, 2);
		expect(posteriorMean(strongPosterior)).toBeLessThan(posteriorMean(weakPosterior));
		expect(Math.abs(posteriorMean(strongPosterior) - baselineRate)).toBeLessThan(Math.abs(posteriorMean(weakPosterior) - baselineRate));
	});
});

describe("probabilityBBeatsA", () => {
	it("is approximately 0.5 when both arms share the same posterior", () => {
		const rng = mulberry32(1);
		const posterior = { alpha: 20, beta: 20 };
		const p = probabilityBBeatsA(posterior, posterior, 5000, rng);
		expect(p).toBeCloseTo(0.5, 1);
	});

	it("is high when B's posterior is clearly better than A's", () => {
		const rng = mulberry32(2);
		const posteriorA = { alpha: 10, beta: 90 }; // ~10%
		const posteriorB = { alpha: 90, beta: 10 }; // ~90%
		const p = probabilityBBeatsA(posteriorA, posteriorB, 5000, rng);
		expect(p).toBeGreaterThan(0.99);
	});

	it("Monte Carlo estimate tightens toward the true value as sample count grows", () => {
		// Symmetric case where the true probability is exactly 0.5 by symmetry — use the
		// deviation from 0.5 across repeated estimates as a stand-in for estimator noise.
		const posteriorA = { alpha: 15, beta: 15 };
		const posteriorB = { alpha: 15, beta: 15 };

		const deviations = (samples: number, seedOffset: number) => {
			const errs: number[] = [];
			for (let i = 0; i < 30; i++) {
				const rng = mulberry32(seedOffset + i);
				errs.push(Math.abs(probabilityBBeatsA(posteriorA, posteriorB, samples, rng) - 0.5));
			}
			return errs.reduce((a, b) => a + b, 0) / errs.length;
		};

		const smallSampleError = deviations(50, 100);
		const largeSampleError = deviations(5000, 200);
		expect(largeSampleError).toBeLessThan(smallSampleError);
	});
});

describe("liftCredibleInterval", () => {
	it("brackets zero when both arms are identical", () => {
		const rng = mulberry32(3);
		const posterior = { alpha: 30, beta: 30 };
		const { low, high, median } = liftCredibleInterval(posterior, posterior, 5000, rng);
		expect(low).toBeLessThan(0);
		expect(high).toBeGreaterThan(0);
		expect(median).toBeCloseTo(0, 1);
	});

	it("is entirely positive when B is clearly better than A", () => {
		const rng = mulberry32(4);
		const posteriorA = { alpha: 10, beta: 90 };
		const posteriorB = { alpha: 90, beta: 10 };
		const { low } = liftCredibleInterval(posteriorA, posteriorB, 5000, rng);
		expect(low).toBeGreaterThan(0);
	});
});

describe("priorStrengthToBetaParams", () => {
	it("has mean equal to the baseline rate at any strength, not fixed at 50%", () => {
		for (const baselineRate of [0.01, 0.1, 0.5, 0.9]) {
			for (const s of [0, 0.25, 0.5, 0.75, 1]) {
				const { alpha, beta } = priorStrengthToBetaParams(s, baselineRate);
				expect(alpha / (alpha + beta)).toBeCloseTo(baselineRate, 6);
			}
		}
	});

	it("maps strength 0 to the weak pseudo-count and 1 to the strong one", () => {
		const baselineRate = 0.1;
		const weak = priorStrengthToBetaParams(0, baselineRate, 1, 200);
		const strong = priorStrengthToBetaParams(1, baselineRate, 1, 200);
		expect(weak.alpha + weak.beta).toBeCloseTo(1, 6);
		expect(strong.alpha + strong.beta).toBeCloseTo(200, 6);
	});

	it("clamps out-of-range strength input", () => {
		const baselineRate = 0.1;
		const below = priorStrengthToBetaParams(-5, baselineRate, 1, 200);
		const above = priorStrengthToBetaParams(5, baselineRate, 1, 200);
		expect(below.alpha + below.beta).toBeCloseTo(1, 6);
		expect(above.alpha + above.beta).toBeCloseTo(200, 6);
	});

	it("clamps a degenerate baseline rate away from exactly 0 or 1", () => {
		const zero = priorStrengthToBetaParams(0.5, 0, 1, 200);
		const one = priorStrengthToBetaParams(0.5, 1, 1, 200);
		expect(zero.alpha).toBeGreaterThan(0);
		expect(one.beta).toBeGreaterThan(0);
	});
});
