import { describe, expect, it } from "vitest";
import { buildScaleReadings, excludesZero, intervalWidth } from "../../src/lib/stats-sim/cuped-readings";
import { HERO_CUBE_SEED, LIVE_EXPERIMENT_DEFAULTS } from "../../src/lib/stats-sim/cuped-defaults";
import { runCupedExperiment } from "../../src/lib/stats-sim/cuped-experiment";

const config = { ...LIVE_EXPERIMENT_DEFAULTS, seed: HERO_CUBE_SEED };
const readings = buildScaleReadings(config);

describe("buildScaleReadings (the hero run)", () => {
	it("reads every day of the live experiment's run, raw and CUPED", () => {
		const experiment = runCupedExperiment(config);
		expect(readings.days).toHaveLength(config.days);
		readings.days.forEach((d, i) => {
			const e = experiment.days[i];
			expect(d.day).toBe(i + 1);
			expect(d.visitors).toBe(60 * d.day);
			expect(d.raw.lift).toBe(e.raw_mean_b - e.raw_mean_a);
			expect(d.raw.low).toBe(e.raw_ci_low);
			expect(d.cuped.high).toBe(e.cuped_ci_high);
			expect(d.cuped.p).toBe(e.cuped_p_value);
		});
	});

	it("centers each interval on its lift", () => {
		for (const d of readings.days) {
			for (const r of [d.raw, d.cuped]) expect((r.low + r.high) / 2).toBeCloseTo(r.lift, 9);
		}
	});

	it("gives a narrower interval after CUPED on every day of this run", () => {
		for (const d of readings.days) expect(intervalWidth(d.cuped)).toBeLessThan(intervalWidth(d.raw));
	});

	it("agrees with the z-test: the interval leaves out zero exactly when p < 0.05", () => {
		for (const d of readings.days) {
			for (const r of [d.raw, d.cuped]) expect(excludesZero(r)).toBe(r.p < 0.05);
		}
	});

	it("sizes the dial to hold every interval, in whole labeled steps", () => {
		const widest = Math.max(...readings.days.flatMap((d) => [d.raw.low, d.raw.high, d.cuped.low, d.cuped.high].map(Math.abs)));
		expect(readings.dialMax).toBeGreaterThanOrEqual(widest);
		expect(readings.dialMax % readings.labelStep).toBe(0);
		expect(readings.dialMax).toBe(12);
		expect(readings.trueLift).toBe(4);
	});

	it("pins the published day-20 numbers for seed 1", () => {
		const last = readings.days.at(-1)!;
		expect([last.raw.lift, last.raw.low, last.raw.high].map((v) => v.toFixed(2))).toEqual(["3.17", "0.90", "5.44"]);
		expect([last.cuped.lift, last.cuped.low, last.cuped.high].map((v) => v.toFixed(2))).toEqual(["3.23", "1.72", "4.74"]);
	});
});
