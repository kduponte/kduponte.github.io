import { describe, expect, it } from "vitest";
import { toSearchInterestPoints, yearlyAverage } from "../../src/lib/toyota-truck/search-interest";

describe("toSearchInterestPoints", () => {
	it("parses numeric strings into numbers", () => {
		const points = toSearchInterestPoints([{ month: "2016-02", term_22re: "100", term_22r: "75", term_vintage_toyota_pickup: "0", term_90s_toyota_truck: "0" }]);
		expect(points).toEqual([{ month: "2016-02", term_22re: 100, term_22r: 75, term_vintage_toyota_pickup: 0, term_90s_toyota_truck: 0 }]);
	});

	it("drops a row with a malformed month", () => {
		const points = toSearchInterestPoints([{ month: "not-a-month", term_22re: "50", term_22r: "40", term_vintage_toyota_pickup: "0", term_90s_toyota_truck: "0" }]);
		expect(points).toEqual([]);
	});
});

describe("yearlyAverage", () => {
	it("averages monthly points by calendar year across all four terms", () => {
		const points = [
			{ month: "2020-01", term_22re: 60, term_22r: 50, term_vintage_toyota_pickup: 0, term_90s_toyota_truck: 1 },
			{ month: "2020-02", term_22re: 70, term_22r: 60, term_vintage_toyota_pickup: 2, term_90s_toyota_truck: 3 },
		];
		const summary = yearlyAverage(points);
		expect(summary).toEqual([
			{ year: 2020, avg_22re: 65, avg_22r: 55, avg_vintage_toyota_pickup: 1, avg_90s_toyota_truck: 2, months_counted: 2, partial_year: true },
		]);
	});

	it("marks a full 12-month year as not partial", () => {
		const points = Array.from({ length: 12 }, (_, i) => ({
			month: `2019-${String(i + 1).padStart(2, "0")}`,
			term_22re: 50,
			term_22r: 40,
			term_vintage_toyota_pickup: 0,
			term_90s_toyota_truck: 0,
		}));
		const summary = yearlyAverage(points);
		expect(summary[0].partial_year).toBe(false);
		expect(summary[0].months_counted).toBe(12);
	});

	it("sorts by year ascending", () => {
		const points = [
			{ month: "2022-01", term_22re: 1, term_22r: 1, term_vintage_toyota_pickup: 0, term_90s_toyota_truck: 0 },
			{ month: "2020-01", term_22re: 1, term_22r: 1, term_vintage_toyota_pickup: 0, term_90s_toyota_truck: 0 },
			{ month: "2021-01", term_22re: 1, term_22r: 1, term_vintage_toyota_pickup: 0, term_90s_toyota_truck: 0 },
		];
		expect(yearlyAverage(points).map((y) => y.year)).toEqual([2020, 2021, 2022]);
	});
});
