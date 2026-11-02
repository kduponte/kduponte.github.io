import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/lib/stats-sim/rng";
import { binByWithinStationSpread, decomposeSpread, spreadOf, type DisagreementPoint } from "../../src/lib/surf-forecast/disagreement";

describe("spreadOf", () => {
	it("is the range of the forecasts", () => {
		expect(spreadOf([1.2, 0.8, 2.0])).toBeCloseTo(1.2, 12);
		expect(spreadOf([1])).toBe(0);
		expect(() => spreadOf([])).toThrow();
	});
});

describe("binByWithinStationSpread", () => {
	it("shows error rising with spread when spread genuinely carries information", () => {
		const rng = mulberry32(1);
		const points: DisagreementPoint[] = Array.from({ length: 1000 }, () => {
			const spread = rng() * 2;
			return { station: "A", spread, abs_error: spread * 0.5 + rng() * 0.1 };
		});
		const bins = binByWithinStationSpread(points, 5);
		expect(bins).toHaveLength(5);
		for (let i = 1; i < bins.length; i++) expect(bins[i].mae).toBeGreaterThan(bins[i - 1].mae);
	});

	it("stays flat when spread is unrelated to error", () => {
		const rng = mulberry32(2);
		const points = Array.from({ length: 5000 }, () => ({ station: "A", spread: rng() * 2, abs_error: rng() }));
		const bins = binByWithinStationSpread(points, 5);
		const maes = bins.map((b) => b.mae);
		expect(Math.max(...maes) - Math.min(...maes)).toBeLessThan(0.05);
	});

	it("removes the station confound that pooling would manufacture", () => {
		// Station S is sheltered: big spread and big error. Station E is exposed: small spread, small
		// error. Within each station spread is pure noise. Pooled, spread would look predictive.
		const rng = mulberry32(3);
		const points: DisagreementPoint[] = [];
		for (let i = 0; i < 2000; i++) points.push({ station: "S", spread: 2 + rng(), abs_error: 1 + rng() * 0.2 });
		for (let i = 0; i < 2000; i++) points.push({ station: "E", spread: rng(), abs_error: 0.1 + rng() * 0.2 });
		const bins = binByWithinStationSpread(points, 5);
		const maes = bins.map((b) => b.mae);
		expect(Math.max(...maes) - Math.min(...maes)).toBeLessThan(0.05);
	});

	it("puts equal shares of each station in every bin", () => {
		const points = Array.from({ length: 10 }, (_, i) => ({ station: "A", spread: i, abs_error: i }));
		expect(binByWithinStationSpread(points, 5).map((b) => b.n)).toEqual([2, 2, 2, 2, 2]);
	});

	it("skips a station too small to fill every bin", () => {
		const points = [
			{ station: "tiny", spread: 1, abs_error: 1 },
			{ station: "tiny", spread: 2, abs_error: 2 },
		];
		expect(binByWithinStationSpread(points, 5)).toEqual([]);
	});
});

describe("decomposeSpread", () => {
	it("attributes a constant offset between systems entirely to the systematic part", () => {
		// System B always reads 1 m above A, and they move together.
		const targets = [1, 2, 3, 2, 1].map((a) => [a, a + 1]);
		const d = decomposeSpread(targets);
		expect(d?.systematic).toBeCloseTo(1, 12);
		expect(d?.daily_median).toBeCloseTo(0, 12);
		expect(d?.median_range).toBeCloseTo(1, 12);
	});

	it("attributes disagreement about timing to the daily part", () => {
		// Same long-run average, opposite day-to-day swings.
		const targets = [
			[1, 3],
			[3, 1],
			[1, 3],
			[3, 1],
		];
		const d = decomposeSpread(targets);
		expect(d?.systematic).toBeCloseTo(0, 12);
		expect(d?.daily_median).toBeCloseTo(2, 12);
	});

	it("reports the worst tenth of days separately from the typical day", () => {
		const targets = Array.from({ length: 100 }, (_, i) => [0, i < 90 ? 0.5 : 3]);
		const d = decomposeSpread(targets);
		expect(d?.median_range).toBeCloseTo(0.5, 12);
		expect(d?.p90_range).toBeGreaterThan(0.5);
	});

	it("refuses to mix targets with different numbers of systems", () => {
		expect(() => decomposeSpread([[1, 2, 3], [1, 2]])).toThrow();
		expect(() => decomposeSpread([[1]])).toThrow();
		expect(decomposeSpread([])).toBeNull();
	});

	it("reports the mean forecast so spread can be read against surf size", () => {
		expect(decomposeSpread([[1, 3], [2, 4]])?.mean_forecast).toBeCloseTo(2.5, 12);
	});

	it("names the system whose average sits apart from the others", () => {
		const d = decomposeSpread([
			[1, 1.1, 3],
			[2, 2.1, 4],
		]);
		expect(d?.system_means.map((m) => Number(m.toFixed(2)))).toEqual([1.5, 1.6, 3.5]);
		expect(d?.outlier).toBe(2);
	});
});
