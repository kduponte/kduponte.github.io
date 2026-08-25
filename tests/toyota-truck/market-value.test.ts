import { describe, expect, it } from "vitest";
import {
	combineSales,
	curatedSalesToRecords,
	hagertyPastSalesToRecords,
	medianByModelYear,
	parseSaleCalendarYear,
	parseYearFromDescription,
	salesByCalendarYear,
	toClassicComYearSummaries,
	toValueByYearPoints,
	type SaleRecord,
} from "../../src/lib/toyota-truck/market-value";

describe("parseYearFromDescription", () => {
	it("extracts the leading year from a Hagerty past-sale description", () => {
		expect(parseYearFromDescription("1988 Toyota Pickup SR5")).toBe(1988);
		expect(parseYearFromDescription("1984 Toyota 4Runner Base")).toBe(1984);
	});

	it("returns null when there's no leading year", () => {
		expect(parseYearFromDescription("Toyota Pickup SR5")).toBeNull();
	});
});

describe("toValueByYearPoints", () => {
	it("parses price strings with commas into numbers", () => {
		const points = toValueByYearPoints([{ model: "pickup", year: "1988", price_usd: "10,800" }]);
		expect(points).toEqual([{ year: 1988, price_usd: 10800, model: "pickup", source: "Hagerty (#3 Good condition)" }]);
	});

	it("filters out rows that don't parse to a valid year or price", () => {
		const points = toValueByYearPoints([{ model: "pickup", year: "not-a-year", price_usd: "10,800" }]);
		expect(points).toEqual([]);
	});
});

describe("hagertyPastSalesToRecords", () => {
	it("parses a real-shaped Hagerty past-sale row", () => {
		const records = hagertyPastSalesToRecords([
			{
				sale_year_model_trim: "1988 Toyota Pickup SR5",
				price_usd: "17,588",
				mileage: "119000",
				sale_date: "Aug 5, 2026",
				auction_platform: "Bring a Trailer",
				detail_url: "https://example.com/1",
			},
		]);
		expect(records).toEqual([
			{
				year: 1988,
				price_usd: 17588,
				mileage: 119000,
				sale_date: "Aug 5, 2026",
				platform: "Bring a Trailer",
				description: "1988 Toyota Pickup SR5",
				detail_url: "https://example.com/1",
			},
		]);
	});

	it("keeps a row with no mileage as null rather than 0", () => {
		const records = hagertyPastSalesToRecords([
			{ sale_year_model_trim: "1987 Toyota 4Runner Base", price_usd: "22,066", mileage: "", sale_date: "Jun 24, 2026", auction_platform: "Collecting Cars", detail_url: "https://example.com/2" },
		]);
		expect(records[0].mileage).toBeNull();
	});

	it("drops a row with no parseable year", () => {
		const records = hagertyPastSalesToRecords([
			{ sale_year_model_trim: "Toyota Pickup SR5", price_usd: "17,588", mileage: "119000", sale_date: "Aug 5, 2026", auction_platform: "Bring a Trailer", detail_url: "https://example.com/3" },
		]);
		expect(records).toEqual([]);
	});
});

describe("curatedSalesToRecords", () => {
	it("parses a directly-verified curated sale row", () => {
		const records = curatedSalesToRecords([
			{ description: "1990 Toyota Pickup Deluxe 4x4", year: "1990", price_usd: "13000", mileage: "188700", sale_date: "2022-06-20", platform: "Cars & Bids", detail_url: "https://carsandbids.com/x" },
		]);
		expect(records).toEqual([
			{ year: 1990, price_usd: 13000, mileage: 188700, sale_date: "2022-06-20", platform: "Cars & Bids", description: "1990 Toyota Pickup Deluxe 4x4", detail_url: "https://carsandbids.com/x" },
		]);
	});
});

describe("combineSales", () => {
	it("de-dupes by detail_url and sorts by year ascending", () => {
		const a: ReturnType<typeof curatedSalesToRecords> = [
			{ year: 1994, price_usd: 19025, mileage: null, sale_date: null, platform: "Cars & Bids", description: "b", detail_url: "https://a.example/1" },
		];
		const b: ReturnType<typeof curatedSalesToRecords> = [
			{ year: 1986, price_usd: 4800, mileage: null, sale_date: null, platform: "Cars & Bids", description: "a", detail_url: "https://a.example/2" },
			{ year: 1994, price_usd: 19025, mileage: null, sale_date: null, platform: "Cars & Bids", description: "b duplicate", detail_url: "https://a.example/1" },
		];
		const combined = combineSales(a, b);
		expect(combined.map((r) => r.year)).toEqual([1986, 1994]);
		expect(combined).toHaveLength(2);
	});
});

const SAMPLE_SALES: SaleRecord[] = [
	{ year: 1987, price_usd: 10000, mileage: null, sale_date: "Jan 1, 2024", platform: "Bring a Trailer", description: "a", detail_url: "1" },
	{ year: 1987, price_usd: 20000, mileage: null, sale_date: "Jan 1, 2025", platform: "Cars & Bids", description: "b", detail_url: "2" },
	{ year: 1987, price_usd: 30000, mileage: null, sale_date: "Jan 1, 2026", platform: "Bring a Trailer", description: "c", detail_url: "3" },
	{ year: 1990, price_usd: 5000, mileage: null, sale_date: null, platform: "Cars & Bids", description: "d", detail_url: "4" },
];

describe("medianByModelYear", () => {
	it("computes median, min, max, and count per model year", () => {
		const summary = medianByModelYear(SAMPLE_SALES);
		expect(summary).toEqual([
			{ year: 1987, median: 20000, min: 10000, max: 30000, count: 3 },
			{ year: 1990, median: 5000, min: 5000, max: 5000, count: 1 },
		]);
	});

	it("averages the two middle values for an even-sized group", () => {
		const summary = medianByModelYear([
			{ year: 2000, price_usd: 10000, mileage: null, sale_date: null, platform: "x", description: "", detail_url: "1" },
			{ year: 2000, price_usd: 20000, mileage: null, sale_date: null, platform: "x", description: "", detail_url: "2" },
		]);
		expect(summary[0].median).toBe(15000);
	});
});

describe("parseSaleCalendarYear", () => {
	it("parses an ISO date", () => {
		expect(parseSaleCalendarYear("2022-06-20")).toBe(2022);
	});

	it("parses a bare year", () => {
		expect(parseSaleCalendarYear("2020")).toBe(2020);
	});

	it("parses a Hagerty-style 'Mon D, YYYY' date", () => {
		expect(parseSaleCalendarYear("Aug 5, 2026")).toBe(2026);
	});

	it("returns null for no date", () => {
		expect(parseSaleCalendarYear(null)).toBeNull();
	});

	it("returns null for unparseable garbage", () => {
		expect(parseSaleCalendarYear("sold")).toBeNull();
	});
});

describe("salesByCalendarYear", () => {
	it("drops undated sales and sorts by calendar year ascending", () => {
		const points = salesByCalendarYear(SAMPLE_SALES);
		expect(points.map((p) => p.calendar_year)).toEqual([2024, 2025, 2026]);
		expect(points).toHaveLength(3);
	});

	it("carries the model year alongside the calendar year", () => {
		const points = salesByCalendarYear(SAMPLE_SALES);
		expect(points[0]).toEqual({ calendar_year: 2024, price_usd: 10000, model_year: 1987, platform: "Bring a Trailer", description: "a" });
	});
});

describe("toClassicComYearSummaries", () => {
	it("parses a full row with percentile and range data", () => {
		const summaries = toClassicComYearSummaries([
			{ year: "1987", median_price_usd: "17000", p25_price_usd: "16000", p75_price_usd: "32000", min_price_usd: "5000", max_price_usd: "62000", note: "" },
		]);
		expect(summaries).toEqual([{ year: 1987, median: 17000, p25: 16000, p75: 32000, min: 5000, max: 62000, note: "" }]);
	});

	it("keeps missing percentile/range fields as null rather than 0, for a thin-sample year", () => {
		const summaries = toClassicComYearSummaries([
			{ year: "1976", median_price_usd: "8500", p25_price_usd: "", p75_price_usd: "", min_price_usd: "", max_price_usd: "", note: "single/thin sample" },
		]);
		expect(summaries[0].p25).toBeNull();
		expect(summaries[0].max).toBeNull();
		expect(summaries[0].note).toBe("single/thin sample");
	});

	it("sorts by year ascending", () => {
		const summaries = toClassicComYearSummaries([
			{ year: "1994", median_price_usd: "18500", p25_price_usd: "", p75_price_usd: "", min_price_usd: "", max_price_usd: "", note: "" },
			{ year: "1976", median_price_usd: "8500", p25_price_usd: "", p75_price_usd: "", min_price_usd: "", max_price_usd: "", note: "" },
		]);
		expect(summaries.map((s) => s.year)).toEqual([1976, 1994]);
	});

	it("drops a row with no parseable year or median", () => {
		const summaries = toClassicComYearSummaries([
			{ year: "not-a-year", median_price_usd: "8500", p25_price_usd: "", p75_price_usd: "", min_price_usd: "", max_price_usd: "", note: "" },
		]);
		expect(summaries).toEqual([]);
	});
});
