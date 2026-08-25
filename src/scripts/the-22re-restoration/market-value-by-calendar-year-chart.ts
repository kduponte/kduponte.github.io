// Fetches public/data/toyota-truck/market_calendar_year_sales.json at runtime: the same 18 sales,
// plotted by when they actually sold instead of which model year they are. Deliberately a plain
// scatter, no median line, no error bars: 13 of the 16 dated sales happened in the last few months
// of 2026 (Hagerty's free tier only surfaces its most recent past sales, the other ~278 in its own
// archive are paywalled), so there isn't real per-year sample density to summarize honestly. This
// shows what's actually known instead of implying a smoothness the data doesn't have.
import * as Plot from "@observablehq/plot";

interface CalendarSalePoint {
	calendar_year: number;
	price_usd: number;
	model_year: number;
	platform: string;
	description: string;
}

async function render() {
	const chartEl = document.getElementById("mv-calendar-year-chart");
	if (!chartEl) return;

	const points: CalendarSalePoint[] = await fetch("/data/toyota-truck/market_calendar_year_sales.json").then((r) => r.json());
	const platforms = [...new Set(points.map((p) => p.platform))];
	const accentColors = ["var(--color-accent-blue)", "var(--color-accent-green)", "var(--color-accent-yellow)"];

	const plot = Plot.plot({
		width: chartEl.clientWidth || 700,
		height: 340,
		marginLeft: 60,
		x: { label: "Year sold", tickFormat: "d", grid: true, domain: [2019, 2027] },
		y: { label: "Price (USD)", tickFormat: (d: number) => `$${(d / 1000).toFixed(0)}k`, grid: true },
		color: { legend: true, label: "Platform", domain: platforms, range: platforms.map((_, i) => accentColors[i % accentColors.length]) },
		marks: [
			Plot.dot(points, {
				x: "calendar_year",
				y: "price_usd",
				fill: "platform",
				r: 5,
				title: (d: CalendarSalePoint) => `${d.description}\n$${d.price_usd.toLocaleString()}, sold ${d.calendar_year}\n${d.platform}`,
			}),
			Plot.ruleY([0]),
		],
	});
	chartEl.replaceChildren(plot);
}

document.addEventListener("DOMContentLoaded", () => {
	render();
});
