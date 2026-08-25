// Fetches public/data/toyota-truck/search_interest_yearly.json at runtime, same fetch-frozen-JSON
// pattern as every other chart on this page. Four lines, grouped by color and distinguished by
// line style: two repair/maintenance-oriented searches ("22re" solid, "22r" dashed, both blue) and
// two collector-framing searches ("vintage toyota pickup" solid, "90s toyota truck" dashed, both
// green), all normalized 0-100 relative to each other by Google Trends itself. 2026 is a partial
// year (8 of 12 months), marked as such.
import * as Plot from "@observablehq/plot";

interface YearlyAverage {
	year: number;
	avg_22re: number;
	avg_22r: number;
	avg_vintage_toyota_pickup: number;
	avg_90s_toyota_truck: number;
	months_counted: number;
	partial_year: boolean;
}

async function render() {
	const chartEl = document.getElementById("mv-search-interest-chart");
	if (!chartEl) return;

	const yearly: YearlyAverage[] = await fetch("/data/toyota-truck/search_interest_yearly.json").then((r) => r.json());

	const series22re = yearly.map((y) => ({ year: y.year, value: y.avg_22re, term: '"22re"' }));
	const series22r = yearly.map((y) => ({ year: y.year, value: y.avg_22r, term: '"22r"' }));
	const seriesVintage = yearly.map((y) => ({ year: y.year, value: y.avg_vintage_toyota_pickup, term: '"vintage toyota pickup"' }));
	const series90s = yearly.map((y) => ({ year: y.year, value: y.avg_90s_toyota_truck, term: '"90s toyota truck"' }));
	const partialYears = yearly.filter((y) => y.partial_year);

	const plot = Plot.plot({
		width: chartEl.clientWidth || 700,
		height: 360,
		marginLeft: 50,
		x: { label: "Year", tickFormat: "d", grid: true },
		y: { label: "Relative search interest (0-100)", grid: true },
		color: {
			legend: true,
			label: "Search term",
			domain: ['"22re"', '"22r"', '"vintage toyota pickup"', '"90s toyota truck"'],
			range: ["var(--color-accent-blue)", "var(--color-accent-blue)", "var(--color-accent-green)", "var(--color-accent-green)"],
		},
		marks: [
			Plot.lineY(series22re, { x: "year", y: "value", stroke: "term", strokeWidth: 2 }),
			Plot.lineY(series22r, { x: "year", y: "value", stroke: "term", strokeWidth: 2, strokeDasharray: "4,3" }),
			Plot.lineY(seriesVintage, { x: "year", y: "value", stroke: "term", strokeWidth: 2 }),
			Plot.lineY(series90s, { x: "year", y: "value", stroke: "term", strokeWidth: 2, strokeDasharray: "4,3" }),
			Plot.dot(partialYears, { x: "year", y: "avg_22re", r: 3, fill: "var(--color-ink-soft)" }),
			Plot.text(partialYears, { x: "year", y: "avg_22re", text: () => "partial year", dy: -12, fontSize: 10, fill: "var(--color-ink-soft)" }),
			Plot.ruleY([0]),
		],
	});
	chartEl.replaceChildren(plot);
}

document.addEventListener("DOMContentLoaded", () => {
	render();
});
