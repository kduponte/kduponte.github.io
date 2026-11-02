// What the buoys actually recorded: the share of synoptic hours each one reported a wave height,
// by month. Every gap here is a stretch with no ground truth at all, so it is shown before any
// accuracy number rather than buried under one.
import * as Plot from "@observablehq/plot";
import { REGION_LABEL, type Region } from "../../lib/surf-forecast/spots";
import { wireTableToggle } from "../shared/chart-utils";
import { loadForecastData, type CoverageRow } from "./data-client";

const REGIONS: Region[] = ["hawaii", "norcal", "socal"];
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

export async function initCoverage(root: HTMLElement) {
	const { coverage, meta } = await loadForecastData();
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	wireTableToggle(root);

	const nameOf = new Map(meta.stations.map((s) => [s.station, `${s.name} (${s.station})`]));
	const months = [...new Set(coverage.map((c) => c.month))].sort();
	const monthLabel = (m: string) => MONTH_LABEL[Number(m.slice(5, 7)) - 1];

	const render = () => {
		const width = chartEl.clientWidth || 720;
		const blocks = REGIONS.map((region) => {
			const rows = coverage.filter((c) => c.region === region).map((c) => ({ ...c, name: nameOf.get(c.station) ?? c.station }));
			const stations = [...new Set(rows.map((r) => r.name))];
			const wrap = document.createElement("div");
			wrap.className = "mt-4 first:mt-0";
			const h = document.createElement("p");
			h.className = "font-mono text-xs uppercase tracking-wide text-ink-soft";
			h.textContent = REGION_LABEL[region];
			wrap.append(
				h,
				Plot.plot({
					width,
					height: 26 * stations.length + 30,
					marginLeft: Math.min(210, width * 0.42),
					marginTop: 24,
					marginBottom: 6,
					x: { domain: months, tickFormat: monthLabel, label: null, axis: "top", tickSize: 0 },
					y: { domain: stations, label: null },
					color: { type: "linear", domain: [0, 1], range: ["#e6e0d1", "#2e4a87"] },
					marks: [
						Plot.cell(rows, { x: "month", y: "name", fill: "share", inset: 1, rx: 2 }),
						// Label only the months that fall short, so the gaps carry text and full months stay quiet.
						Plot.text(
							rows.filter((r) => r.share < 0.95),
							{
								x: "month",
								y: "name",
								text: (r: CoverageRow) => `${Math.round(r.share * 100)}%`,
								fill: (r: CoverageRow) => (r.share > 0.55 ? "#f4f0e6" : "#17140f"),
								fontSize: 10,
							},
						),
						Plot.tip(
							rows,
							Plot.pointer({
								x: "month",
								y: "name",
								title: (r: CoverageRow & { name: string }) =>
									`${r.name}, ${monthLabel(r.month)}\n${r.hours_with_obs} of ${r.synoptic_hours} synoptic hours reported\n${Math.round(r.share * 100)}% coverage`,
							}),
						),
					],
				}),
			);
			return wrap;
		});
		chartEl.replaceChildren(...blocks);
	};

	tableEl.innerHTML = `<table class="w-full min-w-[640px] text-left text-sm">
		<caption class="pb-2 text-left text-xs text-ink-soft">Share of synoptic hours (00, 06, 12, 18 UTC) with a wave-height reading within 30 minutes.</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft"><th class="py-2 pr-4">Buoy</th>${months
			.map((m) => `<th class="py-2 pr-3">${monthLabel(m)}</th>`)
			.join("")}</tr></thead>
		<tbody>${meta.stations
			.map(
				(s) =>
					`<tr class="border-b border-line/60"><td class="py-2 pr-4">${s.name} (${s.station})</td>${months
						.map((m) => {
							const c = coverage.find((x) => x.station === s.station && x.month === m);
							return `<td class="py-2 pr-3 font-mono">${c ? `${Math.round(c.share * 100)}%` : "—"}</td>`;
						})
						.join("")}</tr>`,
			)
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
	const root = document.querySelector<HTMLElement>("#fg-coverage");
	if (root) initCoverage(root);
});
