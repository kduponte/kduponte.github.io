// How much independent evidence the pairs actually carry. Errors cluster by day and across
// neighbouring buoys, so tens of thousands of pairs are worth far fewer independent observations.
// The bar is the pair count; the dark segment is what a block bootstrap says it is worth.
import * as Plot from "@observablehq/plot";
import { wireTableToggle } from "../shared/chart-utils";
import { DISPLAY_UNIT, displayValue, loadForecastData, type ComparisonRow } from "./data-client";

const LEAD = 3;

export async function initIndependence(root: HTMLElement) {
	const { comparisons } = await loadForecastData();
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	wireTableToggle(root);

	const rows = comparisons.filter((c) => c.variable === "wave_height" && c.lead_days === LEAD);
	const order = rows.map((r) => r.question);

	const render = () => {
		const width = chartEl.clientWidth || 720;
		const narrow = width < 560;
		chartEl.replaceChildren(
			Plot.plot({
				width,
				height: 46 * rows.length + 40,
				marginLeft: narrow ? 150 : 290,
				marginRight: 24,
				x: { grid: true, label: "Forecast pairs compared (wave height, three days out)", labelAnchor: "center", tickFormat: "s" },
				y: { domain: order, label: null, tickFormat: (q: string) => (narrow ? q.replace(" against ", " v ").replace(" grid", "") : q) },
				marks: [
					Plot.barX(rows, { y: "question", x: "n_values", fill: "#dad2c0", rx: 3, insetTop: 6, insetBottom: 6 }),
					Plot.barX(rows, { y: "question", x: "effective_n", fill: "#5c5647", rx: 3, insetTop: 6, insetBottom: 6 }),
					Plot.text(rows, {
						y: "question",
						x: "effective_n",
						text: (r: ComparisonRow) => `worth ${r.effective_n.toLocaleString()}`,
						textAnchor: "start",
						dx: 6,
						fill: "#17140f",
						fontSize: 11,
					}),
					Plot.tip(
						rows,
						Plot.pointerY({
							y: "question",
							x: "n_values",
							title: (r: ComparisonRow) =>
								`${r.question}\n${r.n_values.toLocaleString()} pairs over ${r.n_days} days\nWorth about ${r.effective_n.toLocaleString()} independent pairs\nHonest error bar ${(r.se_block / r.se_naive).toFixed(1)}x the naive one`,
						}),
					),
				],
			}),
		);
	};

	const fmt = (c: ComparisonRow, v: number) => {
		const d = displayValue(c.variable, v) ?? 0;
		return `${d >= 0 ? "+" : ""}${d.toFixed(c.variable === "wave_height" ? 2 : c.variable === "wave_period" ? 2 : 1)}`;
	};
	const verdict = (yes: boolean) => (yes ? "distinguishable" : "not distinguishable");
	const shown = comparisons.filter((c) => c.lead_days === LEAD);
	tableEl.innerHTML = `<table class="w-full min-w-[860px] text-left text-sm">
		<caption class="pb-2 text-left text-xs text-ink-soft">Mean of |error A| minus |error B| three days out; negative favours the first system. Both 95% intervals shown.</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">Comparison</th><th class="py-2 pr-4">Variable</th><th class="py-2 pr-4">Difference</th><th class="py-2 pr-4">Honest interval</th><th class="py-2 pr-4">Naive interval</th><th class="py-2 pr-4">Pairs, worth</th><th class="py-2">Verdict</th>
		</tr></thead><tbody>${shown
			.map((c) => {
				const unit = DISPLAY_UNIT[c.variable];
				const flips = c.naively_distinguishable && !c.distinguishable;
				return `<tr class="border-b border-line/60${flips ? " bg-line/30" : ""}"><td class="py-2 pr-4">${c.question}</td><td class="py-2 pr-4">${c.variable.replace("wave_", "")}</td><td class="py-2 pr-4 font-mono">${fmt(c, c.mean_abs_error_difference)} ${unit}</td><td class="py-2 pr-4 font-mono">${fmt(c, c.ci_low)} to ${fmt(c, c.ci_high)}</td><td class="py-2 pr-4 font-mono">${fmt(c, c.naive_ci_low)} to ${fmt(c, c.naive_ci_high)}</td><td class="py-2 pr-4 font-mono">${c.n_values.toLocaleString()}, ${c.effective_n.toLocaleString()}</td><td class="py-2">${flips ? `naive: ${verdict(true)}; honest: ${verdict(false)}` : verdict(c.distinguishable)}</td></tr>`;
			})
			.join("")}</tbody></table>`;

	let lastWidth = chartEl.clientWidth;
	new ResizeObserver(() => {
		if (Math.abs(chartEl.clientWidth - lastWidth) > 40) {
			lastWidth = chartEl.clientWidth;
			render();
		}
	}).observe(chartEl);
	render();
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#fg-independence");
	if (root) initIndependence(root);
});
