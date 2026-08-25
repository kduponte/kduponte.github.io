// Fetches the frozen public/data/toyota-truck/failure_category_by_source.json at runtime and
// renders a grouped bar chart, same fetch-frozen-JSON pattern as failure-chart.ts. Shows whether a
// category's mix actually looks different per forum, most usefully whether TacomaWorld's general
// catchall subforum really is less on-topic than YotaTech's/IH8MUD's dedicated ones.
import * as Plot from "@observablehq/plot";

interface CategoryBySourceCount {
	category: string;
	source_id: string;
	source_name: string;
	count: number;
}

async function render() {
	const chartEl = document.getElementById("pp-failure-by-source-chart");
	if (!chartEl) return;

	const rows: CategoryBySourceCount[] = await fetch("/data/toyota-truck/failure_category_by_source.json").then((r) => r.json());
	const categories = [...new Set(rows.map((r) => r.category))];
	const categoryTotals = new Map<string, number>();
	for (const r of rows) categoryTotals.set(r.category, (categoryTotals.get(r.category) ?? 0) + r.count);
	const sortedCategories = categories.sort((a, b) => (categoryTotals.get(b) ?? 0) - (categoryTotals.get(a) ?? 0));

	const plot = Plot.plot({
		width: chartEl.clientWidth || 600,
		height: Math.max(320, sortedCategories.length * 46),
		marginLeft: 190,
		x: { label: "Threads", grid: true },
		y: { label: null, domain: sortedCategories },
		color: { legend: true, domain: ["YotaTech", "IH8MUD", "TacomaWorld"], range: ["var(--color-accent-blue)", "var(--color-accent-green)", "var(--color-accent-yellow)"] },
		marks: [
			Plot.barX(rows, {
				x: "count",
				y: "category",
				fill: "source_name",
				sort: { y: "-x" },
			}),
		],
	});
	chartEl.replaceChildren(plot);
}

document.addEventListener("DOMContentLoaded", () => {
	render();
});
