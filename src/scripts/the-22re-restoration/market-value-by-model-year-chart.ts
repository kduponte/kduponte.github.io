// Fetches public/data/toyota-truck/market_classiccom_years.json (primary: real median / 25th-75th
// percentile / full range by model year, hand-read from classic.com's real market chart, 1976-1994,
// see src/lib/toyota-truck/market-value.ts for why this is a one-time hand-read, not a live scrape)
// and market_model_year_summary.json (secondary: the individually-traced sales already on this
// page, 1984-1994, shown as a cross-check against classic.com's independent numbers) and renders
// both on one chart. Anchored on the left by the real, verified 1984 base-to-loaded MSRP range
// ($6,188-$10,338, iSeeCars.com), shown as a distinct reference marker, not folded into either
// resale series.
import * as Plot from "@observablehq/plot";

interface ClassicComYearSummary {
	year: number;
	median: number;
	p25: number | null;
	p75: number | null;
	min: number | null;
	max: number | null;
	note: string;
}

interface YearSummary {
	year: number;
	median: number;
	min: number;
	max: number;
	count: number;
}

const MSRP_1984 = { year: 1984, low: 6188, high: 10338 };

async function render() {
	const chartEl = document.getElementById("mv-model-year-chart");
	if (!chartEl) return;

	const [classicCom, individualSales]: [ClassicComYearSummary[], YearSummary[]] = await Promise.all([
		fetch("/data/toyota-truck/market_classiccom_years.json").then((r) => r.json()),
		fetch("/data/toyota-truck/market_model_year_summary.json").then((r) => r.json()),
	]);
	const classicComWithRange = classicCom.filter((s) => s.min !== null && s.max !== null);
	const classicComWithBand = classicCom.filter((s) => s.p25 !== null && s.p75 !== null);

	const plot = Plot.plot({
		width: chartEl.clientWidth || 700,
		height: 420,
		marginLeft: 60,
		x: { label: "Model year", tickFormat: "d", grid: true },
		y: { label: "Price (USD)", tickFormat: (d: number) => `$${(d / 1000).toFixed(0)}k`, grid: true },
		marks: [
			Plot.ruleX([MSRP_1984], { x: "year", y1: "low", y2: "high", stroke: "var(--color-accent-yellow)", strokeWidth: 4 }),
			Plot.text([MSRP_1984], { x: "year", y: "high", dy: -12, text: () => "1984 MSRP, new", fill: "var(--color-ink-soft)", fontSize: 11 }),
			// classic.com: full range (thin) + 25th-75th percentile band (thick) + median dot
			Plot.ruleX(classicComWithRange, { x: "year", y1: "min", y2: "max", stroke: "var(--color-line)", strokeWidth: 2 }),
			Plot.ruleX(classicComWithBand, { x: "year", y1: "p25", y2: "p75", stroke: "var(--color-accent-green)", strokeWidth: 6, strokeOpacity: 0.6 }),
			Plot.dot(classicCom, {
				x: "year",
				y: "median",
				r: 5,
				fill: "var(--color-accent-green)",
				title: (d: ClassicComYearSummary) =>
					`${d.year} (classic.com): median $${d.median.toLocaleString()}` +
					(d.p25 !== null && d.p75 !== null ? `, 25th-75th $${d.p25.toLocaleString()}-$${d.p75.toLocaleString()}` : "") +
					(d.min !== null && d.max !== null ? `, range $${d.min.toLocaleString()}-$${d.max.toLocaleString()}` : "") +
					(d.note ? ` (${d.note})` : ""),
			}),
			// Individually-traced sales already on this page, as a smaller cross-check overlay
			Plot.dot(individualSales, {
				x: "year",
				y: "median",
				r: 3,
				fill: "var(--color-accent-blue)",
				title: (d: YearSummary) => `${d.year} (this page's traced sales): median $${d.median.toLocaleString()}, n=${d.count}`,
			}),
		],
	});
	chartEl.replaceChildren(plot);

	const legendEl = document.getElementById("mv-model-year-legend");
	if (legendEl) {
		legendEl.innerHTML = `
			<span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background:var(--color-accent-green)"></span>classic.com market data, 1976-1994 (median, 25th-75th percentile band, full range)</span>
			<span class="ml-4 inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background:var(--color-accent-blue)"></span>this page's individually-traced sales, 1984-1994 (cross-check)</span>
			<span class="ml-4 inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-1 rounded-sm" style="background:var(--color-accent-yellow)"></span>1984 MSRP, new</span>
		`;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	render();
});
