import { describe, expect, it } from "vitest";
import { mulberry32, standardNormal } from "../../src/lib/stats-sim/rng";
import {
	meanSquaredError,
	mseSkillScore,
	pearson,
	signedErrors,
	summarizeErrors,
} from "../../src/lib/surf-forecast/error-metrics";

describe("signedErrors", () => {
	it("is forecast minus observed", () => {
		expect(signedErrors([2, 3], [1, 5], "linear")).toEqual([1, -2]);
	});

	it("wraps direction to the short way round", () => {
		expect(signedErrors([350], [10], "circular")).toEqual([-20]);
		expect(signedErrors([10], [350], "circular")).toEqual([20]);
	});

	it("refuses mismatched inputs rather than silently pairing the wrong rows", () => {
		expect(() => signedErrors([1, 2], [1], "linear")).toThrow();
	});
});

describe("summarizeErrors, linear", () => {
	it("matches hand-computed values", () => {
		const s = summarizeErrors([2, 3, 4], [1, 3, 5], "linear", 0.5);
		expect(s.n).toBe(3);
		expect(s.bias).toBeCloseTo(0, 12);
		expect(s.mae).toBeCloseTo(2 / 3, 12);
		expect(s.rmse).toBeCloseTo(Math.sqrt(2 / 3), 12);
		expect(s.share_within).toBeCloseTo(1 / 3, 12);
	});

	it("satisfies RMSE^2 = bias^2 + centered_RMSE^2 exactly", () => {
		const rng = mulberry32(7);
		const observed = Array.from({ length: 500 }, () => 1.5 + Math.abs(standardNormal(rng)));
		// A forecast that is both offset and noisy.
		const forecast = observed.map((o) => o + 0.3 + 0.2 * standardNormal(rng));
		const s = summarizeErrors(forecast, observed, "linear", 0.3);
		expect((s.rmse ?? 0) ** 2).toBeCloseTo((s.bias ?? 0) ** 2 + (s.centered_rmse ?? 0) ** 2, 10);
	});

	it("separates a consistently offset forecast from an erratic one with the same RMSE", () => {
		const observed = [1, 2, 3, 4];
		const offset = summarizeErrors([1.5, 2.5, 3.5, 4.5], observed, "linear", 0.1);
		const erratic = summarizeErrors([1.5, 1.5, 3.5, 3.5], observed, "linear", 0.1);
		expect(offset.rmse).toBeCloseTo(erratic.rmse ?? 0, 12);
		expect(offset.bias).toBeCloseTo(0.5, 12);
		expect(offset.centered_rmse).toBeCloseTo(0, 12);
		expect(erratic.bias).toBeCloseTo(0, 12);
		expect(erratic.centered_rmse).toBeCloseTo(0.5, 12);
	});

	it("scales MAE by the mean observation", () => {
		const s = summarizeErrors([1.1, 2.2], [1, 2], "linear", 1);
		expect(s.relative_mae).toBeCloseTo(0.15 / 1.5, 12);
	});

	it("reports correlation for a forecast that tracks the swell but sits high", () => {
		const s = summarizeErrors([2, 4, 6, 8], [1, 2, 3, 4], "linear", 0.1);
		expect(s.correlation).toBeCloseTo(1, 12);
		expect(s.bias).toBeGreaterThan(0);
	});

	it("returns nulls rather than zeros for an empty group", () => {
		const s = summarizeErrors([], [], "linear", 0.3);
		expect(s).toEqual({
			n: 0,
			bias: null,
			mae: null,
			rmse: null,
			centered_rmse: null,
			correlation: null,
			relative_mae: null,
			share_within: null,
		});
	});
});

describe("summarizeErrors, circular", () => {
	it("measures the short way round", () => {
		const s = summarizeErrors([350, 10], [10, 350], "circular", 22.5);
		expect(s.mae).toBeCloseTo(20, 12);
		expect(s.share_within).toBe(1);
	});

	it("does not let errors of +170 and -170 cancel into a fake zero bias", () => {
		const s = summarizeErrors([190, 0], [20, 170], "circular", 22.5);
		// Signed errors are +170 and -170. Their linear mean is 0; their circular mean is 180.
		expect(Math.abs(s.bias ?? 0)).toBeCloseTo(180, 6);
		expect(s.mae).toBeCloseTo(170, 12);
	});

	it("recovers a consistent clockwise offset", () => {
		const observed = [0, 90, 180, 270, 359];
		const forecast = observed.map((o) => (o + 15) % 360);
		const s = summarizeErrors(forecast, observed, "circular", 22.5);
		expect(s.bias).toBeCloseTo(15, 6);
		expect(s.centered_rmse).toBeCloseTo(0, 6);
	});

	it("reports no mean direction when errors are spread evenly around the compass", () => {
		const s = summarizeErrors([0, 90, 180, 270], [0, 0, 0, 0], "circular", 22.5);
		expect(s.bias).toBeNull();
		// With no offset to remove, all of the RMSE is scatter.
		expect(s.centered_rmse).toBeCloseTo(s.rmse ?? -1, 12);
	});

	it("leaves the linear-only fields empty", () => {
		const s = summarizeErrors([10, 20, 30], [12, 18, 33], "circular", 22.5);
		expect(s.correlation).toBeNull();
		expect(s.relative_mae).toBeNull();
	});
});

describe("pearson", () => {
	it("is +1 and -1 at the extremes and null when either side is constant", () => {
		expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
		expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 12);
		expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
		expect(pearson([1, 2], [1, 2])).toBeNull();
	});
});

describe("mseSkillScore", () => {
	it("is positive when the model beats the reference and negative when it loses", () => {
		expect(mseSkillScore(0.25, 1)).toBeCloseTo(0.75, 12);
		expect(mseSkillScore(1, 1)).toBe(0);
		expect(mseSkillScore(2, 1)).toBeCloseTo(-1, 12);
	});

	it("is undefined against a perfect reference", () => {
		expect(mseSkillScore(0.5, 0)).toBeNull();
		expect(mseSkillScore(null, 1)).toBeNull();
	});

	it("pairs with meanSquaredError", () => {
		expect(meanSquaredError([1, -1, 2])).toBeCloseTo(2, 12);
		expect(meanSquaredError([])).toBeNull();
	});
});
