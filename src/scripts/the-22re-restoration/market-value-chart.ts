// Fetches the frozen public/data/toyota-truck/market_value_by_year.json and market_sales.json at
// runtime, same fetch-frozen-JSON pattern as failure-chart.ts. Renders Hagerty's #3-Good condition
// guide value as a per-model reference line/dot series, with the 18 individually-traceable real
// sales scattered on top, colored by auction platform, so the reader can see both the guide curve
// and how real sales actually land around it.
import * as Plot from "@observablehq/plot";

interface ValueByYearPoint {
	year: number;
	price_usd: number;
	model: string;
	source: string;
}

interface SaleRecord {
	year: number;
	price_usd: number;
	mileage: number | null;
	sale_date: string | null;
	platform: string;
	description: string;
	detail_url: string;
}

async function render() {
	const chartEl = document.getElementById("mv-value-chart");
	const summaryEl = document.getElementById("mv-value-summary");
	if (!chartEl || !summaryEl) return;

	const [valueByYear, sales]: [ValueByYearPoint[], SaleRecord[]] = await Promise.all([
		fetch("/data/toyota-truck/market_value_by_year.json").then((r) => r.json()),
		fetch("/data/toyota-truck/market_sales.json").then((r) => r.json()),
	]);

	const minPrice = Math.min(...sales.map((s) => s.price_usd));
	const maxPrice = Math.max(...sales.map((s) => s.price_usd));
	const minYear = Math.min(...sales.map((s) => s.year));
	const maxYear = Math.max(...sales.map((s) => s.year));
	summaryEl.innerHTML = `
		<span class="font-display text-2xl text-ink">$${minPrice.toLocaleString()} - $${maxPrice.toLocaleString()}</span>
		<span class="ml-2 text-sm text-ink-soft">${sales.length} individually-traceable real sales, ${minYear}-${maxYear} &middot; plus ${valueByYear.length} Hagerty guide-value points, ${Math.min(...valueByYear.map((v) => v.year))}-${Math.max(...valueByYear.map((v) => v.year))}</span>
	`;

	// One shared color scale covering both layers, so the legend actually explains what the pale
	// outline dots are (Hagerty's guide value) instead of leaving them unlabeled next to the bolder,
	// platform-colored real-sale dots.
	const GUIDE_LABEL = "Hagerty guide (#3 Good)";
	const platforms = [...new Set(sales.map((s) => s.platform))];
	const accentColors = ["var(--color-accent-blue)", "var(--color-accent-green)", "var(--color-accent-yellow)"];
	const valueByYearWithSeries = valueByYear.map((d) => ({ ...d, series: GUIDE_LABEL }));

	const plot = Plot.plot({
		width: chartEl.clientWidth || 700,
		height: 420,
		marginLeft: 60,
		x: { label: "Model year", tickFormat: "d", grid: true },
		y: { label: "Price (USD)", tickFormat: (d: number) => `$${(d / 1000).toFixed(0)}k`, grid: true },
		color: {
			legend: true,
			label: "Source",
			domain: [GUIDE_LABEL, ...platforms],
			range: ["var(--color-line)", ...platforms.map((_, i) => accentColors[i % accentColors.length])],
		},
		marks: [
			Plot.dot(valueByYearWithSeries, {
				x: "year",
				y: "price_usd",
				fill: "series",
				stroke: "var(--color-ink-soft)",
				r: 3,
				title: (d: ValueByYearPoint) => `${d.year} ${d.model}: $${d.price_usd.toLocaleString()} (${d.source})`,
			}),
			Plot.dot(sales, {
				x: "year",
				y: "price_usd",
				fill: "platform",
				r: 6,
				title: (d: SaleRecord) => `${d.description}\n$${d.price_usd.toLocaleString()}${d.mileage ? `, ${d.mileage.toLocaleString()} mi` : ""}${d.sale_date ? `, ${d.sale_date}` : ""}\n${d.platform}`,
			}),
			Plot.ruleY([0]),
		],
	});
	chartEl.replaceChildren(plot);
}

document.addEventListener("DOMContentLoaded", () => {
	render();
});
