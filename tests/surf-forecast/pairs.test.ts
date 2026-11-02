import { describe, expect, it } from "vitest";
import { parseErddapCsv } from "../../src/lib/surf-forecast/matching";
import {
	pairForecasts,
	pairFromCsv,
	pairToCsv,
	persistencePairs,
	responseKey,
	type PairRow,
} from "../../src/lib/surf-forecast/pairs";

const HEADER = "time,WVHT,DPD,APD,MWD,WSPD,WD\nUTC,m,s,s,degrees_true,m s-1,degrees_true\n";

/** Observations at :56 past each hour from 23:56 the night before through 12:56. */
function obsCsv(): string {
	const rows: string[] = ["2026-05-31T23:56:00Z,1.00,12.0,8.0,300,NaN,NaN"];
	for (let h = 0; h <= 12; h++) {
		const hh = String(h).padStart(2, "0");
		rows.push(`2026-06-01T${hh}:56:00Z,${(1.1 + h * 0.01).toFixed(2)},12.5,8.2,${300 + h},NaN,NaN`);
	}
	return HEADER + rows.join("\n");
}

/** A response for 00:00 to 12:00 with every series filled with a constant. */
function response(fill: (key: string) => unknown): Record<string, unknown> {
	const time = Array.from({ length: 13 }, (_, h) => `2026-06-01T${String(h).padStart(2, "0")}:00`);
	const hourly: Record<string, unknown> = { time };
	for (const variable of ["wave_height", "wave_period", "wave_direction"] as const) {
		for (const model of ["ncep_gfswave016", "ncep_gfswave025", "ecmwf_wam", "ecmwf_wam025", "gwam"] as const) {
			for (const lead of [0, 1, 2, 3, 4, 5, 6, 7]) {
				const key = responseKey(variable, lead, model);
				hourly[key] = time.map(() => fill(key));
			}
		}
	}
	return hourly;
}

describe("responseKey", () => {
	it("matches the multi-model key shape the API actually returns", () => {
		expect(responseKey("wave_height", 3, "ncep_gfswave025")).toBe("wave_height_previous_day3_ncep_gfswave025");
		expect(responseKey("wave_period", 0, "ecmwf_wam")).toBe("wave_period_ecmwf_wam");
	});
});

describe("pairForecasts", () => {
	const obs = parseErddapCsv(obsCsv());

	it("keeps only the synoptic hours", () => {
		const { rows } = pairForecasts("46042", response(() => 1.5), obs);
		const hours = new Set(rows.map((r) => new Date(r.valid_time).getUTCHours()));
		expect([...hours].sort((a, b) => a - b)).toEqual([0, 6, 12]);
	});

	it("pairs each valid hour with the reading four minutes before it", () => {
		const { rows } = pairForecasts("46042", response(() => 1.5), obs);
		const six = rows.find((r) => r.variable === "wave_height" && r.valid_time === "2026-06-01T06:00:00.000Z");
		expect(six?.observed).toBe(1.15);
		expect(six?.obs_offset_min).toBe(-4);
	});

	it("judges period against the average period, never the dominant one", () => {
		const { rows } = pairForecasts("46042", response(() => 9), obs);
		const period = rows.find((r) => r.variable === "wave_period");
		// APD in the fixture is 8.0 to 8.2; DPD is 12.0 to 12.5.
		expect(period?.observed).toBeGreaterThanOrEqual(8);
		expect(period?.observed).toBeLessThan(9);
	});

	it("skips a land-masked station/model combination entirely", () => {
		// ncep_gfswave025 is masked at the Waimea buoy.
		const { rows } = pairForecasts("51201", response(() => 1.5), obs);
		expect(rows.some((r) => r.source === "ncep_gfswave025")).toBe(false);
		expect(rows.some((r) => r.source === "ncep_gfswave016")).toBe(true);
	});

	it("never pairs a lead beyond a model's archived horizon", () => {
		const { rows } = pairForecasts("46042", response(() => 1.5), obs);
		expect(rows.some((r) => r.source === "gwam" && r.lead_days === 7)).toBe(false);
		expect(rows.some((r) => r.source === "gwam" && r.lead_days === 6)).toBe(true);
	});

	it("treats an exact zero height as masked rather than as a flat ocean", () => {
		const { rows, counts } = pairForecasts(
			"46042",
			response((key) => (key.startsWith("wave_height") ? 0 : 5)),
			obs,
		);
		expect(rows.some((r) => r.variable === "wave_height")).toBe(false);
		expect(counts.masked_value).toBeGreaterThan(0);
	});

	it("accepts a direction of exactly 0, which is due north", () => {
		const { rows } = pairForecasts("46042", response((key) => (key.startsWith("wave_direction") ? 0 : 2)), obs);
		expect(rows.some((r) => r.variable === "wave_direction" && r.forecast === 0)).toBe(true);
	});

	it("skips nulls without crashing", () => {
		const { rows } = pairForecasts("46042", response(() => null), obs);
		expect(rows).toEqual([]);
	});

	it("drops a forecast whose valid hour has no reading within 30 minutes, and counts it", () => {
		const sparse = parseErddapCsv(`${HEADER}2026-06-01T06:00:00Z,1.2,12,8,300,NaN,NaN\n`);
		const { rows, counts } = pairForecasts("46042", response(() => 1.5), sparse);
		expect(new Set(rows.map((r) => r.valid_time))).toEqual(new Set(["2026-06-01T06:00:00.000Z"]));
		expect(counts.no_observation).toBeGreaterThan(0);
	});

	it("keeps the books balanced: every forecast considered is paired, masked, or unmatched", () => {
		const { counts } = pairForecasts("46042", response((key) => (key.includes("gwam") ? null : 1.5)), obs);
		expect(counts.paired + counts.masked_value + counts.no_observation).toBe(counts.forecasts_considered);
	});
});

describe("persistencePairs", () => {
	it("forecasts today's reading from the reading one lead earlier", () => {
		const header = HEADER;
		const csv =
			header +
			"2026-06-01T00:00:00Z,1.0,12,8,300,NaN,NaN\n" +
			"2026-06-02T00:00:00Z,2.0,12,8,310,NaN,NaN\n" +
			"2026-06-03T00:00:00Z,3.0,12,8,320,NaN,NaN\n";
		const obs = parseErddapCsv(csv);
		const rows = persistencePairs("46042", obs, [Date.UTC(2026, 5, 3)], [0, 1, 2]);
		const h = rows.filter((r) => r.variable === "wave_height");
		expect(h.map((r) => [r.lead_days, r.forecast, r.observed])).toEqual([
			[1, 2.0, 3.0],
			[2, 1.0, 3.0],
		]);
		expect(rows.every((r) => r.source === "persistence")).toBe(true);
	});

	it("omits lead 0, which would compare a reading with itself", () => {
		const obs = parseErddapCsv(`${HEADER}2026-06-01T00:00:00Z,1.0,12,8,300,NaN,NaN\n`);
		expect(persistencePairs("46042", obs, [Date.UTC(2026, 5, 1)], [0])).toEqual([]);
	});

	it("skips a lead whose earlier reading is missing", () => {
		const obs = parseErddapCsv(`${HEADER}2026-06-03T00:00:00Z,3.0,12,8,320,NaN,NaN\n`);
		expect(persistencePairs("46042", obs, [Date.UTC(2026, 5, 3)], [1])).toEqual([]);
	});
});

describe("CSV round trip", () => {
	it("survives write then read unchanged", () => {
		const row: PairRow = {
			station: "51201",
			valid_time: "2026-06-01T06:00:00.000Z",
			variable: "wave_direction",
			source: "ecmwf_wam",
			lead_days: 3,
			forecast: 12.5,
			observed: 351,
			obs_offset_min: -4,
		};
		expect(pairFromCsv(pairToCsv(row))).toEqual(row);
	});

	it("ignores the header and malformed lines", () => {
		expect(pairFromCsv("station,valid_time,variable,source,lead_days,forecast,observed,obs_offset_min")).toBeNull();
		expect(pairFromCsv("too,few,fields")).toBeNull();
	});
});
