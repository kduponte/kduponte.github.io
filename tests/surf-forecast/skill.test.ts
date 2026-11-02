import { describe, expect, it } from "vitest";
import type { PairRow } from "../../src/lib/surf-forecast/pairs";
import {
	VARIABLE_CONFIG,
	groupSummaries,
	pairedAbsDifferencesByDay,
	persistenceIndex,
	skillAgainstPersistence,
	summarize,
	targetKey,
} from "../../src/lib/surf-forecast/skill";

function row(over: Partial<PairRow>): PairRow {
	return {
		station: "46042",
		valid_time: "2026-06-01T00:00:00.000Z",
		variable: "wave_height",
		source: "ecmwf_wam",
		lead_days: 1,
		forecast: 1,
		observed: 1,
		obs_offset_min: -4,
		...over,
	};
}

describe("VARIABLE_CONFIG", () => {
	it("uses exactly one foot for height and one compass point for direction", () => {
		expect(VARIABLE_CONFIG.wave_height.tolerance).toBeCloseTo(0.3048, 12);
		expect(VARIABLE_CONFIG.wave_direction.tolerance).toBe(360 / 16);
		expect(VARIABLE_CONFIG.wave_direction.kind).toBe("circular");
	});
});

describe("summarize", () => {
	it("routes direction through circular error", () => {
		const s = summarize([row({ variable: "wave_direction", forecast: 350, observed: 10 })], "wave_direction");
		expect(s.mae).toBeCloseTo(20, 12);
	});
});

describe("groupSummaries", () => {
	it("summarises each group separately", () => {
		const rows = [
			row({ source: "ecmwf_wam", forecast: 2, observed: 1 }),
			row({ source: "gwam", forecast: 1, observed: 1 }),
		];
		const out = groupSummaries(rows, (r) => r.source);
		expect(out.get("ecmwf_wam")?.summary.mae).toBe(1);
		expect(out.get("gwam")?.summary.mae).toBe(0);
	});

	it("refuses a group that mixes variables, which would average metres with degrees", () => {
		const rows = [row({ variable: "wave_height" }), row({ variable: "wave_direction" })];
		expect(() => groupSummaries(rows, () => "all")).toThrow(/mixes variables/);
	});
});

describe("skillAgainstPersistence", () => {
	it("scores 1 - MSE_model / MSE_persistence", () => {
		const persist = [
			row({ source: "persistence", forecast: 3, observed: 1 }),
			row({ source: "persistence", valid_time: "2026-06-01T06:00:00.000Z", forecast: 1, observed: 3 }),
		];
		const model = [
			row({ forecast: 2, observed: 1 }),
			row({ valid_time: "2026-06-01T06:00:00.000Z", forecast: 2, observed: 3 }),
		];
		const s = skillAgainstPersistence(model, persistenceIndex(persist));
		expect(s.n).toBe(2);
		expect(s.mse_model).toBeCloseTo(1, 12);
		expect(s.mse_persistence).toBeCloseTo(4, 12);
		expect(s.skill).toBeCloseTo(0.75, 12);
	});

	it("scores only targets both have, so the comparison is never weather against weather", () => {
		const persist = [row({ source: "persistence", forecast: 2, observed: 1 })];
		const model = [
			row({ forecast: 1.5, observed: 1 }),
			// A huge miss on a target persistence never forecast must not count.
			row({ valid_time: "2026-06-02T00:00:00.000Z", forecast: 99, observed: 1 }),
		];
		const s = skillAgainstPersistence(model, persistenceIndex(persist));
		expect(s.n).toBe(1);
		expect(s.skill).toBeCloseTo(0.75, 12);
	});

	it("goes negative when persistence wins", () => {
		const s = skillAgainstPersistence(
			[row({ forecast: 3, observed: 1 })],
			persistenceIndex([row({ source: "persistence", forecast: 1.5, observed: 1 })]),
		);
		expect(s.skill).toBeLessThan(0);
	});

	it("matches leads exactly: a lead-1 baseline never scores a lead-3 forecast", () => {
		const s = skillAgainstPersistence(
			[row({ lead_days: 3, forecast: 2, observed: 1 })],
			persistenceIndex([row({ source: "persistence", lead_days: 1, forecast: 2, observed: 1 })]),
		);
		expect(s.n).toBe(0);
		expect(s.skill).toBeNull();
	});

	it("wraps direction errors before squaring them", () => {
		const s = skillAgainstPersistence(
			[row({ variable: "wave_direction", forecast: 355, observed: 5 })],
			persistenceIndex([row({ variable: "wave_direction", source: "persistence", forecast: 25, observed: 5 })]),
		);
		// Model is 10 degrees off, persistence 20: skill = 1 - 100/400.
		expect(s.skill).toBeCloseTo(0.75, 12);
	});
});

describe("pairedAbsDifferencesByDay", () => {
	it("returns |error A| - |error B| for shared targets, grouped by day in order", () => {
		const a = [
			row({ valid_time: "2026-06-02T00:00:00.000Z", forecast: 3, observed: 1 }),
			row({ valid_time: "2026-06-01T00:00:00.000Z", forecast: 2, observed: 1 }),
			row({ valid_time: "2026-06-01T06:00:00.000Z", forecast: 1, observed: 1 }),
		];
		const b = [
			row({ source: "gwam", valid_time: "2026-06-02T00:00:00.000Z", forecast: 2, observed: 1 }),
			row({ source: "gwam", valid_time: "2026-06-01T00:00:00.000Z", forecast: 1, observed: 1 }),
			row({ source: "gwam", valid_time: "2026-06-01T06:00:00.000Z", forecast: 3, observed: 1 }),
		];
		expect(pairedAbsDifferencesByDay(a, b)).toEqual([[1, -2], [1]]);
	});

	it("drops targets only one source forecast", () => {
		const a = [row({ forecast: 2, observed: 1 })];
		const b = [row({ source: "gwam", lead_days: 2, forecast: 2, observed: 1 })];
		expect(pairedAbsDifferencesByDay(a, b)).toEqual([]);
	});

	it("keys targets on station, hour, variable and lead together", () => {
		expect(targetKey(row({}))).toBe("46042|2026-06-01T00:00:00.000Z|wave_height|1");
	});
});
