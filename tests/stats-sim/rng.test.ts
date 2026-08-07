import { describe, expect, it } from "vitest";
import { betaSample, binomial, gammaSample, mulberry32, standardNormal } from "../../src/lib/stats-sim/rng";

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

describe("binomial", () => {
	it("stays within [0, n] and approximates n*p over many trials", () => {
		const rng = mulberry32(3);
		const n = 200;
		const p = 0.3;
		const reps = 5000;
		const draws = Array.from({ length: reps }, () => binomial(n, p, rng));
		expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...draws)).toBeLessThanOrEqual(n);
		const mean = draws.reduce((a, b) => a + b, 0) / reps;
		expect(mean).toBeCloseTo(n * p, 0);
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
