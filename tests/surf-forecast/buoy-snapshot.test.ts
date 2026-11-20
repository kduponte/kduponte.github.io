import { describe, expect, it } from "vitest";
import {
	chooseTypicalHour,
	parseNdbcWaterTemp,
	waterTempAt,
	instrumentFor,
	meanAbsMiss,
	snapshotReadout,
	toSnapshot,
	type SnapshotCandidate,
} from "../../src/lib/surf-forecast/buoy-snapshot";

function cand(valid_time: string, observed: number, ecmwf: number, noaa: number, dwd: number): SnapshotCandidate {
	return {
		valid_time,
		observed_height_m: observed,
		dominant_period_s: 12,
		direction_deg: 300,
		forecasts: { ecmwf, noaa, dwd },
	};
}

describe("meanAbsMiss", () => {
	it("averages absolute misses across the three systems", () => {
		expect(meanAbsMiss(cand("t", 2, 2.3, 1.7, 2.6))).toBeCloseTo((0.3 + 0.3 + 0.6) / 3);
	});
});

describe("chooseTypicalHour", () => {
	it("returns null for no candidates", () => {
		expect(chooseTypicalHour([])).toBeNull();
	});

	it("picks the hour whose average miss is closest to the median", () => {
		const cs = [
			cand("2026-01-01T00:00:00Z", 1, 1.1, 1.1, 1.1), // miss 0.1
			cand("2026-01-02T00:00:00Z", 1, 1.5, 1.5, 1.5), // miss 0.5 (median of 0.1, 0.5, 0.9)
			cand("2026-01-03T00:00:00Z", 1, 1.9, 1.9, 1.9), // miss 0.9
		];
		const t = chooseTypicalHour(cs)!;
		expect(t.candidate.valid_time).toBe("2026-01-02T00:00:00Z");
		expect(t.median_mean_abs_miss_m).toBeCloseTo(0.5);
		expect(t.candidates_n).toBe(3);
	});

	it("breaks ties toward the later hour", () => {
		const cs = [cand("2026-01-01T00:00:00Z", 1, 1.2, 1.2, 1.2), cand("2026-01-05T00:00:00Z", 1, 0.8, 0.8, 0.8)];
		expect(chooseTypicalHour(cs)!.candidate.valid_time).toBe("2026-01-05T00:00:00Z");
	});
});

describe("instrumentFor", () => {
	it("knows Monterey is a discus hull and the rest are Waveriders", () => {
		expect(instrumentFor("46042")).toBe("discus");
		expect(instrumentFor("51201")).toBe("waverider");
	});
});

describe("toSnapshot and snapshotReadout", () => {
	const typical = chooseTypicalHour([cand("2026-02-14T06:00:00.000Z", 3.2, 3.5, 2.8, 3.0)])!;
	const snap = toSnapshot("51201", 1, typical);

	it("signs each miss as forecast minus observed", () => {
		const bySystem = Object.fromEntries(snap.forecasts.map((f) => [f.system, f.miss_m]));
		expect(bySystem.ecmwf).toBeCloseTo(0.3);
		expect(bySystem.noaa).toBeCloseTo(-0.4);
		expect(bySystem.dwd).toBeCloseTo(-0.2);
	});

	it("reads out the real numbers in plain language", () => {
		const r = snapshotReadout(snap);
		expect(r.title).toBe("Waimea Bay · 51201");
		expect(r.when).toBe("Feb 14, 2026, 06:00 UTC");
		expect(r.observed).toContain("3.20 m");
		expect(r.observed).toContain("from WNW (300°)");
		expect(r.forecasts.map((f) => f.text)).toEqual(["ECMWF 3.50 m (+0.30 m)", "NOAA 2.80 m (−0.40 m)", "DWD 3.00 m (−0.20 m)"]);
		expect(r.note).toContain("1 day ahead");
	});
});

describe("water temperature", () => {
	// Rows as NDBC writes them (51201, September 2026), plus a missing reading (999.0).
	const txt = [
		"#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS  TIDE",
		"#yr  mo dy hr mn degT m/s  m/s     m   sec   sec deg    hPa  degC  degC  degC  nmi    ft",
		"2026 09 18 17 26 999 99.0 99.0  1.20  7.14  5.45  36 9999.0 999.0  26.7 999.0 99.0 99.00",
		"2026 09 18 17 56 999 99.0 99.0  1.25  7.14  5.69  37 9999.0 999.0 999.0 999.0 99.0 99.00",
		"2026 09 18 18 26 999 99.0 99.0  1.31  7.69  5.59  34 9999.0 999.0  26.8 999.0 99.0 99.00",
		"",
	].join("\n");

	it("parses the WTMP column by name, dropping NDBC's missing-value code", () => {
		const series = parseNdbcWaterTemp(txt);
		expect(series.map((o) => o.value)).toEqual([26.7, 26.8]);
		expect(new Date(series[0].time_ms).toISOString()).toBe("2026-09-18T17:26:00.000Z");
	});

	it("tolerates a file with no rows or no WTMP column", () => {
		expect(parseNdbcWaterTemp("")).toEqual([]);
		expect(parseNdbcWaterTemp("#YY  MM DD hh mm WVHT\n2026 09 18 17 26 1.2\n")).toEqual([]);
	});

	it("takes the nearest reading within 30 minutes of the hour", () => {
		// 17:56 is missing, so 18:26 (26 min after) beats 17:26 (34 min before, outside the window anyway).
		expect(waterTempAt(parseNdbcWaterTemp(txt), "2026-09-18T18:00:00.000Z")).toBe(26.8);
	});

	it("gives null when nothing is within 30 minutes", () => {
		expect(waterTempAt(parseNdbcWaterTemp(txt), "2026-09-18T20:00:00.000Z")).toBeNull();
	});

	it("reads out in Celsius and Fahrenheit, or not at all", () => {
		const typical = chooseTypicalHour([cand("2026-02-14T06:00:00.000Z", 3.2, 3.5, 2.8, 3.0)])!;
		const snap = toSnapshot("51201", 1, typical);
		expect(snapshotReadout(snap).water).toBeNull();
		snap.observed.water_temp_c = 26.4;
		expect(snapshotReadout(snap).water).toBe("Sea surface 26.4 °C (80 °F)");
	});
});
