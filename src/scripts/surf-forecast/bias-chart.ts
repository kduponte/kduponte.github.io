// Where the models go wrong: each system's average signed error at every buoy, three days out.
// A dot right of zero means that system forecast bigger surf than the buoy recorded.
//
// The grey bar joining each buoy's dots is the spread between systems at that buoy, which is the
// disagreement a surfer would see comparing forecasts there.
import * as Plot from "@observablehq/plot";
import { REGION_LABEL, type Region } from "../../lib/surf-forecast/spots";
import { wireTableToggle } from "../shared/chart-utils";
import { METRES_TO_FEET, loadForecastData } from "./data-client";
import { REPRESENTATIVE, SERIES_COLORS, SERIES_LABELS, SYSTEM_ORDER, labelFor, legendHtml } from "./palette";

const REGIONS: Region[] = ["hawaii", "norcal", "socal"];
const LEAD = 3;

interface Dot {
	region: Region;
	name: string;
	label: string;
	bias: number;
	mae: number;
	n: number;
}

export async function initBias(root: HTMLElement) {
	const { stations, meta } = await loadForecastData();
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const legendEl = root.querySelector<HTMLElement>("[data-fg-legend]");
	wireTableToggle(root);
	if (legendEl) legendEl.innerHTML = legendHtml(SERIES_LABELS.slice(0, 3), SERIES_COLORS.slice(0, 3));

	const reps = SYSTEM_ORDER.map((s) => REPRESENTATIVE[s]);
	const dots: Dot[] = [];
	for (const s of meta.stations) {
		for (const source of reps) {
			const r = stations.find((x) => x.scope === s.station && x.source === source && x.variable === "wave_height" && x.lead_days === LEAD);
			if (!r || r.bias === null || r.mae === null) continue;
			dots.push({ region: s.region, name: s.name, label: labelFor(source), bias: r.bias * METRES_TO_FEET, mae: r.mae * METRES_TO_FEET, n: r.n });
		}
	}
	const extent = Math.max(...dots.map((d) => Math.abs(d.bias)));
	const domain: [number, number] = [-Math.ceil(extent), Math.ceil(extent)];

	const render = () => {
		const width = chartEl.clientWidth || 720;
		const blocks = REGIONS.map((region) => {
			const rows = dots.filter((d) => d.region === region);
			const names = [...new Set(rows.map((d) => d.name))].sort((a, b) => {
				const mean = (n: string) => rows.filter((d) => d.name === n).reduce((acc, d) => acc + d.bias, 0) / 3;
				return mean(b) - mean(a);
			});
			const spans = names.map((name) => {
				const b = rows.filter((d) => d.name === name).map((d) => d.bias);
				return { name, lo: Math.min(...b), hi: Math.max(...b) };
			});
			const wrap = document.createElement("div");
			wrap.className = "mt-5 first:mt-0";
			const h = document.createElement("p");
			h.className = "font-mono text-xs uppercase tracking-wide text-ink-soft";
			h.textContent = REGION_LABEL[region];
			wrap.append(
				h,
				Plot.plot({
					width,
					height: 30 * names.length + 34,
					marginLeft: Math.min(170, width * 0.36),
					// Fixed so the zero line sits in the same place in every block, axis or not.
					marginRight: 24,
					marginTop: 6,
					x: {
						domain,
						grid: true,
						label: region === "socal" ? "Average error three days out (ft): left forecast too small, right too big" : null,
						labelAnchor: "center",
						tickFormat: (v: number) => (v > 0 ? `+${v}` : `${v}`),
						axis: region === "socal" ? "bottom" : null,
					},
					y: { domain: names, label: null },
					color: { domain: SERIES_LABELS, range: SERIES_COLORS },
					marks: [
						Plot.ruleX([0], { stroke: "#5c5647", strokeWidth: 1 }),
						Plot.link(spans, { x1: "lo", x2: "hi", y1: "name", y2: "name", stroke: "#dad2c0", strokeWidth: 4, strokeLinecap: "round" }),
						Plot.dot(rows, { x: "bias", y: "name", fill: "label", r: 5, stroke: "#f4f0e6", strokeWidth: 2 }),
						Plot.tip(
							rows,
							Plot.pointer({
								x: "bias",
								y: "name",
								title: (d: Dot) =>
									`${d.label} at ${d.name}\nAverage error ${d.bias >= 0 ? "+" : ""}${d.bias.toFixed(2)} ft (${d.bias >= 0 ? "too big" : "too small"})\nAverage miss ${d.mae.toFixed(2)} ft\n${d.n.toLocaleString()} forecasts`,
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
		<caption class="pb-2 text-left text-xs text-ink-soft">Wave height three days out, in feet. Average error is signed (positive means the forecast was too big); average miss ignores the sign.</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">Buoy</th><th class="py-2 pr-4">Region</th>${SYSTEM_ORDER.map((s) => `<th class="py-2 pr-4">${labelFor(REPRESENTATIVE[s])} error / miss</th>`).join("")}
		</tr></thead><tbody>${meta.stations
			.map((s) => {
				const cells = reps.map((source) => {
					const d = dots.find((x) => x.name === s.name && x.label === labelFor(source));
					return `<td class="py-2 pr-4 font-mono">${d ? `${d.bias >= 0 ? "+" : ""}${d.bias.toFixed(2)} / ${d.mae.toFixed(2)}` : "—"}</td>`;
				});
				return `<tr class="border-b border-line/60"><td class="py-2 pr-4">${s.name} (${s.station})</td><td class="py-2 pr-4">${REGION_LABEL[s.region]}</td>${cells.join("")}</tr>`;
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
	const root = document.querySelector<HTMLElement>("#fg-bias");
	if (root) initBias(root);
});
