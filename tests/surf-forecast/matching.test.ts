import { describe, expect, it } from "vitest";
import {
	isAnalysisHour,
	mergeSeries,
	nearestWithin,
	parseErddapCsv,
	parseOpenMeteoTime,
	sortAndDedupe,
	type Observation,
} from "../../src/lib/surf-forecast/matching";

const HEADER = "time,WVHT,DPD,APD,MWD,WSPD,WD\nUTC,m,s,s,degrees_true,m s-1,degrees_true\n";
const t = (iso: string) => Date.parse(iso);

describe("parseErddapCsv", () => {
	it("reads a real Hawaii response shape", () => {
		const csv =
			HEADER +
			"2026-06-01T00:56:00Z,1.14,7.69,5.37,20,NaN,NaN\n" +
			"2026-06-01T01:26:00Z,1.15,9.09,5.25,351,NaN,NaN\n";
		const s = parseErddapCsv(csv);
		expect(s.WVHT).toEqual([
			{ time_ms: t("2026-06-01T00:56:00Z"), value: 1.14 },
			{ time_ms: t("2026-06-01T01:26:00Z"), value: 1.15 },
		]);
		expect(s.MWD.map((o) => o.value)).toEqual([20, 351]);
		// Wave-only Datawell buoy: no wind at all, and NaN must not become a reading.
		expect(s.WSPD).toEqual([]);
	});

	it("filters each column independently, which is the Monterey interleaving case", () => {
		// Wind on every row, waves on one row in three.
		const csv =
			HEADER +
			"2026-06-01T00:00:00Z,NaN,NaN,NaN,NaN,6.1,300\n" +
			"2026-06-01T00:10:00Z,NaN,NaN,NaN,NaN,6.3,302\n" +
			"2026-06-01T00:20:00Z,2.40,12.5,7.8,295,6.0,298\n" +
			"2026-06-01T00:30:00Z,NaN,NaN,NaN,NaN,5.9,299\n";
		const s = parseErddapCsv(csv);
		expect(s.WSPD).toHaveLength(4);
		expect(s.WVHT).toHaveLength(1);
		expect(s.WVHT[0]).toEqual({ time_ms: t("2026-06-01T00:20:00Z"), value: 2.4 });
	});

	it("keeps a reading whose wave column is real even when its wind column is not, and vice versa", () => {
		const csv = HEADER + "2026-06-01T00:00:00Z,1.5,NaN,NaN,NaN,NaN,NaN\n";
		const s = parseErddapCsv(csv);
		expect(s.WVHT).toHaveLength(1);
		expect(s.APD).toHaveLength(0);
	});

	it("rejects sentinel values that would masquerade as a huge swell", () => {
		const csv =
			HEADER +
			"2026-06-01T00:00:00Z,99.0,99.0,99.0,999,99.0,999\n" +
			"2026-06-01T00:30:00Z,0,0,0,0,0,0\n";
		const s = parseErddapCsv(csv);
		expect(s.WVHT).toEqual([]);
		expect(s.DPD).toEqual([]);
		expect(s.MWD.map((o) => o.value)).toEqual([0]);
		// A zero wave height is not a calm reading from an open-ocean buoy; it is a fault.
		expect(s.APD).toEqual([]);
		// Calm wind genuinely can be zero.
		expect(s.WSPD.map((o) => o.value)).toEqual([0]);
	});

	it("survives the empty-result stub and blank lines", () => {
		expect(parseErddapCsv("time,WVHT,DPD,APD,MWD,WSPD,WD\n# no matching results\n").WVHT).toEqual([]);
		expect(parseErddapCsv(`${HEADER}\n\n`).WVHT).toEqual([]);
		expect(parseErddapCsv("").WVHT).toEqual([]);
	});

	it("sorts out-of-order rows and drops duplicate timestamps", () => {
		const csv =
			HEADER +
			"2026-06-01T01:00:00Z,1.3,NaN,NaN,NaN,NaN,NaN\n" +
			"2026-06-01T00:00:00Z,1.1,NaN,NaN,NaN,NaN,NaN\n" +
			"2026-06-01T00:00:00Z,9.9,NaN,NaN,NaN,NaN,NaN\n";
		expect(parseErddapCsv(csv).WVHT.map((o) => o.value)).toEqual([1.1, 1.3]);
	});
});

describe("mergeSeries", () => {
	it("joins adjacent months and removes the deliberate one-hour overlap", () => {
		const jan = parseErddapCsv(HEADER + "2026-01-31T23:56:00Z,1.0,NaN,NaN,NaN,NaN,NaN\n");
		const feb = parseErddapCsv(
			HEADER + "2026-01-31T23:56:00Z,1.0,NaN,NaN,NaN,NaN,NaN\n" + "2026-02-01T00:26:00Z,1.2,NaN,NaN,NaN,NaN,NaN\n",
		);
		const merged = mergeSeries([jan, feb]);
		expect(merged.WVHT.map((o) => o.value)).toEqual([1.0, 1.2]);
	});
});

describe("nearestWithin", () => {
	const series: Observation[] = sortAndDedupe([
		{ time_ms: t("2026-06-01T00:56:00Z"), value: 1.14 },
		{ time_ms: t("2026-06-01T01:26:00Z"), value: 1.15 },
		{ time_ms: t("2026-06-01T01:56:00Z"), value: 1.16 },
	]);

	it("takes the nearest reading, which at a :26/:56 buoy is four minutes early for the hour", () => {
		expect(nearestWithin(series, t("2026-06-01T01:00:00Z"))).toEqual({ value: 1.14, offset_min: -4 });
		expect(nearestWithin(series, t("2026-06-01T02:00:00Z"))).toEqual({ value: 1.16, offset_min: -4 });
	});

	it("treats the 30 minute edge as inside the window", () => {
		expect(nearestWithin(series, t("2026-06-01T00:26:00Z"))).toEqual({ value: 1.14, offset_min: 30 });
	});

	it("drops the pair rather than reaching further", () => {
		expect(nearestWithin(series, t("2026-06-01T00:25:00Z"))).toBeNull();
		expect(nearestWithin(series, t("2026-06-01T03:00:00Z"))).toBeNull();
	});

	it("never averages: the value returned is always one real reading", () => {
		const m = nearestWithin(series, t("2026-06-01T01:41:00Z"));
		expect([1.15, 1.16]).toContain(m?.value);
	});

	it("breaks an exact tie toward the earlier reading, so re-runs pair identically", () => {
		expect(nearestWithin(series, t("2026-06-01T01:11:00Z"))).toEqual({ value: 1.14, offset_min: -15 });
	});

	it("handles targets before the first and after the last reading", () => {
		expect(nearestWithin(series, t("2026-06-01T00:40:00Z"))).toEqual({ value: 1.14, offset_min: 16 });
		expect(nearestWithin(series, t("2026-06-01T02:10:00Z"))).toEqual({ value: 1.16, offset_min: -14 });
	});

	it("returns null on an empty series", () => {
		expect(nearestWithin([], t("2026-06-01T00:00:00Z"))).toBeNull();
	});

	it("respects a custom window", () => {
		expect(nearestWithin(series, t("2026-06-01T01:00:00Z"), 3)).toBeNull();
		expect(nearestWithin(series, t("2026-06-01T01:00:00Z"), 4)).not.toBeNull();
	});
});

describe("parseOpenMeteoTime", () => {
	it("reads zone-less timestamps as UTC, not local time", () => {
		expect(parseOpenMeteoTime("2026-06-01T06:00")).toBe(Date.UTC(2026, 5, 1, 6, 0));
	});

	it("accepts an already-zoned timestamp unchanged", () => {
		expect(parseOpenMeteoTime("2026-06-01T06:00:00Z")).toBe(Date.UTC(2026, 5, 1, 6, 0));
	});
});

describe("isAnalysisHour", () => {
	it("keeps only the four synoptic hours", () => {
		const kept = Array.from({ length: 24 }, (_, h) => Date.UTC(2026, 5, 1, h)).filter(isAnalysisHour);
		expect(kept.map((ms) => new Date(ms).getUTCHours())).toEqual([0, 6, 12, 18]);
	});

	it("rejects off-the-hour times", () => {
		expect(isAnalysisHour(Date.UTC(2026, 5, 1, 6, 30))).toBe(false);
	});
});
