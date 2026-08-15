import { describe, expect, it } from "vitest";
import { betaPdf, logGamma } from "../../src/lib/stats-sim/beta-distribution";

describe("logGamma", () => {
	it("matches known exact values", () => {
		expect(logGamma(1)).toBeCloseTo(0, 10); // Gamma(1) = 1
		expect(logGamma(2)).toBeCloseTo(0, 10); // Gamma(2) = 1! = 1
		expect(logGamma(5)).toBeCloseTo(Math.log(24), 9); // Gamma(5) = 4! = 24
		expect(logGamma(10)).toBeCloseTo(Math.log(362880), 6); // Gamma(10) = 9!
		expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 9); // Gamma(1/2) = sqrt(pi)
	});

	it("satisfies the recurrence Gamma(x+1) = x * Gamma(x) in log-space", () => {
		for (const x of [0.3, 1.7, 3.2, 12.8]) {
			const lhs = logGamma(x + 1);
			const rhs = Math.log(x) + logGamma(x);
			expect(lhs).toBeCloseTo(rhs, 8);
		}
	});
});

describe("betaPdf", () => {
	it("is uniform (density 1) for Beta(1, 1)", () => {
		for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
			expect(betaPdf(x, 1, 1)).toBeCloseTo(1, 8);
		}
	});

	it("integrates to ~1 over (0, 1) for a range of shapes", () => {
		const step = 0.0002;
		for (const [alpha, beta] of [
			[2, 2],
			[5, 3],
			[50, 150],
			[200, 20],
		]) {
			let sum = 0;
			for (let x = step / 2; x < 1; x += step) {
				sum += betaPdf(x, alpha, beta) * step;
			}
			expect(sum).toBeCloseTo(1, 2);
		}
	});

	it("peaks at the analytic mode (alpha-1)/(alpha+beta-2) when alpha, beta > 1", () => {
		for (const [alpha, beta] of [
			[5, 3],
			[20, 60],
			[100, 20],
		]) {
			const mode = (alpha - 1) / (alpha + beta - 2);
			const atMode = betaPdf(mode, alpha, beta);
			expect(atMode).toBeGreaterThan(betaPdf(mode - 0.02, alpha, beta));
			expect(atMode).toBeGreaterThan(betaPdf(mode + 0.02, alpha, beta));
		}
	});

	it("returns 0 outside (0, 1)", () => {
		expect(betaPdf(0, 5, 5)).toBe(0);
		expect(betaPdf(1, 5, 5)).toBe(0);
		expect(betaPdf(-0.1, 5, 5)).toBe(0);
		expect(betaPdf(1.1, 5, 5)).toBe(0);
	});

	it("throws for non-positive alpha or beta", () => {
		expect(() => betaPdf(0.5, 0, 5)).toThrow();
		expect(() => betaPdf(0.5, 5, -1)).toThrow();
	});
});
