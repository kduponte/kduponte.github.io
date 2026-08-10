import { describe, expect, it } from "vitest";
import {
	hurdleMeanAndVariance,
	logNormalMeanVariance,
	muFromMeanRevenue,
	normalSample,
	twoSampleZTestOnMeans,
	updateNormalPosterior,
} from "../../src/lib/stats-sim/revenue";
import { bernoulli, mulberry32 } from "../../src/lib/stats-sim/rng";

describe("logNormalMeanVariance", () => {
	it("matches the standard closed-form identities", () => {
		const { mean, variance } = logNormalMeanVariance(2, 1);
		expect(mean).toBeCloseTo(12.182493960703473, 8);
		expect(variance).toBeCloseTo(255.01563439015848, 6);
	});

	it("matches a direct Monte Carlo simulation of exp(Normal(mu, sigma))", () => {
		const rng = mulberry32(1);
		const mu = 3;
		const sigma = 0.8;
		const n = 100000;
		let sum = 0;
		let sumSq = 0;
		for (let i = 0; i < n; i++) {
			// Self-contained Box-Muller so this test doesn't depend on rng.ts internals.
			let u = 0;
			let v = 0;
			while (u === 0) u = rng();
			while (v === 0) v = rng();
			const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
			const x = Math.exp(mu + sigma * z);
			sum += x;
			sumSq += x * x;
		}
		const empiricalMean = sum / n;
		const empiricalVariance = sumSq / n - empiricalMean * empiricalMean;

		const { mean, variance } = logNormalMeanVariance(mu, sigma);
		expect(empiricalMean).toBeCloseTo(mean, -1); // log-normal tails are heavy, loose tolerance
		expect(Math.abs(empiricalVariance - variance) / variance).toBeLessThan(0.3);
	});
});

describe("muFromMeanRevenue", () => {
	it("round-trips with logNormalMeanVariance's mean", () => {
		const sigma = 1.0;
		for (const targetMean of [10, 50, 200]) {
			const mu = muFromMeanRevenue(targetMean, sigma);
			const { mean } = logNormalMeanVariance(mu, sigma);
			expect(mean).toBeCloseTo(targetMean, 6);
		}
	});
});

describe("hurdleMeanAndVariance", () => {
	it("matches a direct Monte Carlo simulation of the two-part process", () => {
		const rng = mulberry32(7);
		const p = 0.05;
		const mu = 3;
		const sigma = 1.0;
		const n = 200000;
		let sum = 0;
		let sumSq = 0;
		for (let i = 0; i < n; i++) {
			let x = 0;
			if (bernoulli(p, rng)) {
				// standard Box-Muller, self-contained so this test doesn't depend on rng internals
				let u = 0;
				let v = 0;
				while (u === 0) u = rng();
				while (v === 0) v = rng();
				const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
				x = Math.exp(mu + sigma * z);
			}
			sum += x;
			sumSq += x * x;
		}
		const empiricalMean = sum / n;
		const empiricalVariance = sumSq / n - empiricalMean * empiricalMean;

		const { mean, variance } = hurdleMeanAndVariance(p, mu, sigma);
		expect(empiricalMean).toBeCloseTo(mean, 0);
		// Heavy-tailed metric: variance estimate is noisier, use a looser relative tolerance.
		expect(Math.abs(empiricalVariance - variance) / variance).toBeLessThan(0.3);
	});

	it("reduces to p=0 giving zero mean and zero variance", () => {
		const { mean, variance } = hurdleMeanAndVariance(0, 3, 1);
		expect(mean).toBe(0);
		expect(variance).toBe(0);
	});

	it("has a positive between-group variance component even when spenders all spend the same amount (sigma near 0)", () => {
		const { variance } = hurdleMeanAndVariance(0.5, 3, 1e-6);
		expect(variance).toBeGreaterThan(0);
	});
});

describe("updateNormalPosterior", () => {
	it("moves the posterior mean toward the observed data mean", () => {
		const priorMean = 3;
		const n = 100;
		const observedMean = 4;
		const posterior = updateNormalPosterior(priorMean, 1, 1, n, observedMean * n);
		expect(posterior.mean).toBeGreaterThan(priorMean);
		expect(posterior.mean).toBeLessThan(observedMean);
		expect(posterior.mean).toBeCloseTo(observedMean, 1); // n=100 vs prior pseudo-count=1, data dominates
	});

	it("posterior variance shrinks as more data accumulates", () => {
		const a = updateNormalPosterior(3, 1, 1, 10, 40);
		const b = updateNormalPosterior(3, 1, 1, 1000, 4000);
		expect(b.variance).toBeLessThan(a.variance);
	});

	it("with zero observations, returns exactly the prior", () => {
		const posterior = updateNormalPosterior(3, 5, 2, 0, 0);
		expect(posterior.mean).toBeCloseTo(3, 10);
		expect(posterior.variance).toBeCloseTo(4 / 5, 10); // sigma^2 / priorPseudoCount = 4/5
	});
});

describe("normalSample", () => {
	it("has approximately the requested mean and sd over a large sample", () => {
		const rng = mulberry32(3);
		const n = 20000;
		const samples = Array.from({ length: n }, () => normalSample(5, 2, rng));
		const mean = samples.reduce((a, b) => a + b, 0) / n;
		const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
		expect(mean).toBeCloseTo(5, 0);
		expect(Math.sqrt(variance)).toBeCloseTo(2, 0);
	});
});

describe("twoSampleZTestOnMeans", () => {
	it("matches a hand-computed reference case", () => {
		const result = twoSampleZTestOnMeans(10, 400, 1000, 12, 450, 1000);
		expect(result.z).toBeCloseTo(2.1693045781865616, 8);
		expect(result.p_value).toBeCloseTo(0.030059461569104773, 8);
	});

	it("returns p close to 1 when there is no observed difference", () => {
		const result = twoSampleZTestOnMeans(10, 400, 1000, 10, 400, 1000);
		expect(result.z).toBeCloseTo(0, 8);
		expect(result.p_value).toBeCloseTo(1, 8);
	});

	it("returns null z/p when either arm has zero observations", () => {
		const result = twoSampleZTestOnMeans(10, 400, 0, 12, 450, 1000);
		expect(result.z).toBeNull();
		expect(result.p_value).toBeNull();
	});

	it("is antisymmetric: swapping which arm is higher flips the sign of z but not p", () => {
		const ab = twoSampleZTestOnMeans(10, 400, 1000, 12, 450, 1000);
		const ba = twoSampleZTestOnMeans(12, 450, 1000, 10, 400, 1000);
		expect(ab.z).toBeCloseTo(-(ba.z as number), 6);
		expect(ab.p_value).toBeCloseTo(ba.p_value as number, 6);
	});
});
