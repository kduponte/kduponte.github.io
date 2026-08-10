import { describe, expect, it } from "vitest";
import { betaSample, binomial, gammaSample, geometricSample, mulberry32, standardNormal } from "../../src/lib/stats-sim/rng";

describe("mulberry32", () => {
	it("is deterministic: same seed produces the same sequence", () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const seqA = Array.from({ length: 20 }, () => a());
		const seqB = Array.from({ length: 20 }, () => b());
		expect(seqA).toEqual(seqB);
	});

	it("different seeds produce different sequences", () => {
		const a = mulberry32(1);
		const b = mulberry32(2);
		const seqA = Array.from({ length: 10 }, () => a());
		const seqB = Array.from({ length: 10 }, () => b());
		expect(seqA).not.toEqual(seqB);
	});

	it("stays within [0, 1)", () => {
		const rng = mulberry32(7);
		for (let i = 0; i < 1000; i++) {
			const v = rng();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe("standardNormal", () => {
	it("has approximately mean 0, sd 1 over a large sample", () => {
		const rng = mulberry32(1);
		const n = 20000;
		const samples = Array.from({ length: n }, () => standardNormal(rng));
		const mean = samples.reduce((a, b) => a + b, 0) / n;
		const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
		expect(mean).toBeCloseTo(0, 1);
		expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
	});
});

describe("geometricSample", () => {
	it("has approximately mean (1-p)/p and stays non-negative", () => {
		const rng = mulberry32(31);
		const p = 0.2;
		const n = 20000;
		const samples = Array.from({ length: n }, () => geometricSample(p, rng));
		expect(samples.every((v) => v >= 0 && Number.isInteger(v))).toBe(true);
		const mean = samples.reduce((a, b) => a + b, 0) / n;
		expect(mean).toBeCloseTo((1 - p) / p, 0);
	});

	it("has a small mean when p is close to 1, and a large mean when p is close to 0", () => {
		const rng = mulberry32(32);
		const highP = Array.from({ length: 2000 }, () => geometricSample(0.9, rng));
		const lowP = Array.from({ length: 2000 }, () => geometricSample(0.001, rng));
		const meanHighP = highP.reduce((a, b) => a + b, 0) / highP.length;
		const meanLowP = lowP.reduce((a, b) => a + b, 0) / lowP.length;
		expect(meanHighP).toBeLessThan(1);
		expect(meanLowP).toBeGreaterThan(500);
	});

	it("throws for non-positive p", () => {
		const rng = mulberry32(1);
		expect(() => geometricSample(0, rng)).toThrow();
		expect(() => geometricSample(-0.1, rng)).toThrow();
	});
});

describe("binomial", () => {
	it("stays within [0, n] and approximates n*p over many trials (small n, uses the naive fallback)", () => {
		const rng = mulberry32(3);
		const n = 20;
		const p = 0.3;
		const reps = 5000;
		const draws = Array.from({ length: reps }, () => binomial(n, p, rng));
		expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...draws)).toBeLessThanOrEqual(n);
		const mean = draws.reduce((a, b) => a + b, 0) / reps;
		expect(mean).toBeCloseTo(n * p, 0);
	});

	it("stays within [0, n] and approximates n*p over many trials (large n, uses the skip-count path)", () => {
		const rng = mulberry32(4);
		const n = 200;
		const p = 0.3;
		const reps = 5000;
		const draws = Array.from({ length: reps }, () => binomial(n, p, rng));
		expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...draws)).toBeLessThanOrEqual(n);
		const mean = draws.reduce((a, b) => a + b, 0) / reps;
		expect(mean).toBeCloseTo(n * p, 0);
	});

	it("matches n*p and n*p*(1-p) for a small-p, huge-n regime (uses the normal-approximation path)", () => {
		const rng = mulberry32(5);
		const n = 500_000;
		const p = 0.01;
		const reps = 300;
		const draws = Array.from({ length: reps }, () => binomial(n, p, rng));
		const mean = draws.reduce((a, b) => a + b, 0) / reps;
		const variance = draws.reduce((a, b) => a + (b - mean) ** 2, 0) / reps;
		expect(mean).toBeCloseTo(n * p, -2); // within ~150 of the expected 5000
		expect(Math.sqrt(variance)).toBeCloseTo(Math.sqrt(n * p * (1 - p)), -1);
	});

	it("matches n*p for a moderate-n, very-small-p regime below the normal-approximation threshold (uses the skip-count path)", () => {
		const rng = mulberry32(9);
		const n = 2000;
		const p = 0.005; // n*p = 10, well under the normal-approximation threshold of 50
		const reps = 5000;
		const draws = Array.from({ length: reps }, () => binomial(n, p, rng));
		expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...draws)).toBeLessThanOrEqual(n);
		const mean = draws.reduce((a, b) => a + b, 0) / reps;
		expect(mean).toBeCloseTo(n * p, 0);
	});

	it("is symmetric for p and 1-p (same distribution of successes vs. failures)", () => {
		const rngA = mulberry32(6);
		const rngB = mulberry32(6);
		const n = 1000;
		const drawsLowP = Array.from({ length: 2000 }, () => binomial(n, 0.2, rngA));
		const drawsHighP = Array.from({ length: 2000 }, () => n - binomial(n, 0.8, rngB));
		const meanLowP = drawsLowP.reduce((a, b) => a + b, 0) / drawsLowP.length;
		const meanHighP = drawsHighP.reduce((a, b) => a + b, 0) / drawsHighP.length;
		expect(meanLowP).toBeCloseTo(meanHighP, 0);
	});

	it("handles p=0 and p=1 exactly, without consuming the geometric-sample path", () => {
		const rng = mulberry32(7);
		expect(binomial(1000, 0, rng)).toBe(0);
		expect(binomial(1000, 1, rng)).toBe(1000);
	});

	it("stays fast for a huge n at a small p (the regime that made the naive loop impractical)", () => {
		const rng = mulberry32(8);
		const start = Date.now();
		binomial(500_000, 0.01, rng);
		expect(Date.now() - start).toBeLessThan(5);
	});

	it("stays fast across a realistic peeking-study workload (many huge-n calls in a tight loop)", () => {
		// Roughly what one repeated-trials study run does: ~30 days x 2 arms x hundreds of
		// trials, each drawing a fresh binomial at high traffic volume.
		const rng = mulberry32(10);
		const start = Date.now();
		for (let i = 0; i < 30 * 2 * 500; i++) binomial(500_000, 0.01, rng);
		expect(Date.now() - start).toBeLessThan(200);
	});
});

describe("gammaSample", () => {
	it("has approximately mean=shape, variance=shape for rate 1 (shape >= 1)", () => {
		const rng = mulberry32(11);
		const shape = 5;
		const n = 20000;
		const samples = Array.from({ length: n }, () => gammaSample(shape, rng));
		const mean = samples.reduce((a, b) => a + b, 0) / n;
		expect(mean).toBeCloseTo(shape, 0);
	});

	it("handles shape < 1 without infinite recursion and stays positive", () => {
		const rng = mulberry32(12);
		const samples = Array.from({ length: 500 }, () => gammaSample(0.3, rng));
		expect(samples.every((v) => v > 0)).toBe(true);
	});

	it("throws for non-positive shape", () => {
		const rng = mulberry32(1);
		expect(() => gammaSample(0, rng)).toThrow();
		expect(() => gammaSample(-1, rng)).toThrow();
	});
});

describe("betaSample", () => {
	it("stays within (0, 1)", () => {
		const rng = mulberry32(21);
		const samples = Array.from({ length: 5000 }, () => betaSample(3, 7, rng));
		expect(samples.every((v) => v > 0 && v < 1)).toBe(true);
	});

	it("has approximately mean alpha/(alpha+beta)", () => {
		const rng = mulberry32(22);
		const alpha = 8;
		const beta = 2;
		const n = 20000;
		const samples = Array.from({ length: n }, () => betaSample(alpha, beta, rng));
		const mean = samples.reduce((a, b) => a + b, 0) / n;
		expect(mean).toBeCloseTo(alpha / (alpha + beta), 1);
	});

	it("is symmetric around 0.5 when alpha === beta", () => {
		const rng = mulberry32(23);
		const n = 20000;
		const samples = Array.from({ length: n }, () => betaSample(4, 4, rng));
		const mean = samples.reduce((a, b) => a + b, 0) / n;
		expect(mean).toBeCloseTo(0.5, 1);
	});
});
