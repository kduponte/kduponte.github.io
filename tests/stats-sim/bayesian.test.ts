import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/lib/stats-sim/rng";
import { liftCredibleInterval, posteriorMean, priorStrengthToBetaParams, probabilityBBeatsA, updatePosterior } from "../../src/lib/stats-sim/bayesian";

describe("updatePosterior / posteriorMean", () => {
	it("moves the posterior mean toward the observed rate", () => {
		const prior = { alpha: 1, beta: 1 }; // uniform
		const posterior = updatePosterior(prior, 80, 20); // 80% observed
		expect(posteriorMean(posterior)).toBeCloseTo(81 / 102, 4);
	});

	it("a stronger prior shrinks the posterior mean toward the prior", () => {
		const weakPrior = priorStrengthToBetaParams(0);
		const strongPrior = priorStrengthToBetaParams(1);
		const weakPosterior = updatePosterior(weakPrior, 8, 2); // small sample, 80% observed
		const strongPosterior = updatePosterior(strongPrior, 8, 2);
		// Both start below the observed 0.8, but the strong-prior posterior should sit closer to 0.5.
		expect(posteriorMean(strongPosterior)).toBeLessThan(posteriorMean(weakPosterior));
		expect(Math.abs(posteriorMean(strongPosterior) - 0.5)).toBeLessThan(Math.abs(posteriorMean(weakPosterior) - 0.5));
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
	it("is centered at alpha === beta across the full range", () => {
		for (const s of [0, 0.25, 0.5, 0.75, 1]) {
			const { alpha, beta } = priorStrengthToBetaParams(s);
			expect(alpha).toBeCloseTo(beta, 6);
		}
	});

	it("maps 0 to the weak end and 1 to the strong end", () => {
		const weak = priorStrengthToBetaParams(0, 1, 200);
		const strong = priorStrengthToBetaParams(1, 1, 200);
		expect(weak.alpha).toBeCloseTo(1, 6);
		expect(strong.alpha).toBeCloseTo(200, 6);
	});

	it("clamps out-of-range input", () => {
		const below = priorStrengthToBetaParams(-5, 1, 200);
		const above = priorStrengthToBetaParams(5, 1, 200);
		expect(below.alpha).toBeCloseTo(1, 6);
		expect(above.alpha).toBeCloseTo(200, 6);
	});
});
