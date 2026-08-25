// Fetches the frozen public/data/toyota-truck/failure_categories.json at runtime and renders a
// real horizontal bar chart, the same fetch-frozen-JSON pattern src/scripts/surf-volume/data-client.ts
// already uses. No live network calls or scraping happen in the browser, this is a one-time,
// offline-collected dataset.
import * as Plot from "@observablehq/plot";

interface CategoryCount {
	category: string;
	count: number;
	percentage: number;
}

interface SourceCount {
	source_id: string;
	source_name: string;
	count: number;
}

async function render() {
	const chartEl = document.getElementById("pp-failure-chart");
	const summaryEl = document.getElementById("pp-failure-summary");
	if (!chartEl || !summaryEl) return;

	const [categories, sources]: [CategoryCount[], SourceCount[]] = await Promise.all([
		fetch("/data/toyota-truck/failure_categories.json").then((r) => r.json()),
		fetch("/data/toyota-truck/failure_sources.json").then((r) => r.json()),
	]);
	const totalThreads = categories.reduce((sum, c) => sum + c.count, 0);
	const top = categories[0];
	const sourceSummary = sources.map((s) => `${s.source_name} (${s.count})`).join(", ");

	summaryEl.innerHTML = `
		<span class="font-display text-2xl text-ink">${top ? top.category : "—"}</span>
		<span class="ml-2 text-sm text-ink-soft">the single most common topic (${top ? top.count : 0} of ${totalThreads} threads, ${top ? top.percentage.toFixed(1) : "0"}%) &middot; ${totalThreads} threads across ${sources.length} sources: ${sourceSummary}</span>
	`;

	const plot = Plot.plot({
		width: chartEl.clientWidth || 600,
		height: Math.max(280, categories.length * 34),
		marginLeft: 190,
		x: { label: "Share of sampled threads", grid: true, tickFormat: (d: number) => `${d.toFixed(0)}%` },
		y: { label: null, domain: categories.map((c) => c.category) },
		marks: [
			Plot.barX(categories, {
				x: "percentage",
				y: "category",
				fill: "var(--color-accent-blue)",
				sort: { y: "-x" },
			}),
			Plot.text(categories, {
				x: "percentage",
				y: "category",
				text: (d: CategoryCount) => `${d.count}`,
				dx: 14,
				fill: "var(--color-ink)",
				fontSize: 11,
			}),
		],
	});
	chartEl.replaceChildren(plot);
}

document.addEventListener("DOMContentLoaded", () => {
	render();
});
