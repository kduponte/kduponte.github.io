// How much the forecasts disagree at every break, three days out, from each break's offshore
// sample point. One row per distinct model sample: breaks whose sample points the models resolve to
// the same grid cells share a row, because they share identical forecasts.
//
// Filled dot: typical range of the three systems. Whisker: the worst tenth of days. Hollow dot: the
// typical gap between ECMWF and NOAA alone, which shows how much of the disagreement the third
// system adds. Shape rather than system colour carries the distinction, because colouring either
// marker as a system would claim it belongs to one.
import * as Plot from "@observablehq/plot";
import { REGION_LABEL, type Region } from "../../lib/surf-forecast/spots";
import { wireTableToggle } from "../shared/chart-utils";
import { METRES_TO_FEET } from "./data-client";

interface LeadStats {
	lead_days: number;
	median_range: number;
	p90_range: number;
	systematic: number;
	daily_median: number;
	mean_forecast: number;
	outlier: string;
	ecmwf_noaa_median: number;
}
interface BreakRow {
	id: string;
	name: string;
	region: Region;
	cell_group: number;
	proxy_tier: string;
	leads: LeadStats[];
}

const REGIONS: Region[] = ["hawaii", "norcal", "socal"];
const LEAD = 3;
const INK = "#5c5647";
const OUTLIER_LABEL: Record<string, string> = { gwam: "DWD", ncep_gfswave016: "NOAA", ecmwf_wam: "ECMWF" };

interface Sample {
	region: Region;
	label: string;
	typical: number;
	worst: number;
	pair: number;
	systematic: number;
	daily: number;
	mean: number;
	outlier: string;
}

export async function initBreakDisagreement(root: HTMLElement) {
	const { rows } = (await fetch("/data/surf-forecast/breaks.json").then((r) => r.json())) as { rows: BreakRow[] };
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const legendEl = root.querySelector<HTMLElement>("[data-fg-legend]");
	wireTableToggle(root);
	if (legendEl) {
		legendEl.innerHTML =
			`<span class="inline-flex items-center gap-2"><span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${INK}"></span>All three systems, typical day</span>` +
			`<span class="inline-flex items-center gap-2"><span aria-hidden="true" style="display:inline-block;width:12px;height:2px;background:#b9b09c"></span>Worst tenth of days</span>` +
			`<span class="inline-flex items-center gap-2"><span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid ${INK}"></span>ECMWF and NOAA only</span>`;
	}

	const groups = new Map<number, BreakRow[]>();
	for (const r of rows) groups.set(r.cell_group, [...(groups.get(r.cell_group) ?? []), r]);
	const samples: Sample[] = [...groups.values()].map((members) => {
		const l = members[0].leads.find((x) => x.lead_days === LEAD) as LeadStats;
		return {
			region: members[0].region,
			label: members.map((m) => m.name).join(" · "),
			typical: l.median_range * METRES_TO_FEET,
			worst: l.p90_range * METRES_TO_FEET,
			pair: l.ecmwf_noaa_median * METRES_TO_FEET,
			systematic: l.systematic * METRES_TO_FEET,
			daily: l.daily_median * METRES_TO_FEET,
			mean: l.mean_forecast * METRES_TO_FEET,
			outlier: OUTLIER_LABEL[l.outlier] ?? l.outlier,
		};
	});
	const xMax = Math.ceil(Math.max(...samples.map((s) => s.worst)));

	const render = () => {
		const width = chartEl.clientWidth || 720;
		const narrow = width < 560;
		chartEl.replaceChildren(
			...REGIONS.map((region) => {
				const rs = samples.filter((s) => s.region === region).sort((a, b) => b.typical - a.typical);
				const wrap = document.createElement("div");
				wrap.className = "mt-5 first:mt-0";
				const h = document.createElement("p");
				h.className = "font-mono text-xs uppercase tracking-wide text-ink-soft";
				h.textContent = REGION_LABEL[region];
				const label = (l: string) => (narrow && l.length > 24 ? `${l.slice(0, 23)}…` : l);
				wrap.append(
					h,
					Plot.plot({
						width,
						height: 24 * rs.length + 34,
						marginLeft: narrow ? 150 : 270,
						marginRight: 24,
						marginTop: 6,
						x: {
							domain: [0, xMax],
							grid: true,
							label: region === "socal" ? "How far apart the forecasts are, three days out (ft)" : null,
							labelAnchor: "center",
							axis: region === "socal" ? "bottom" : null,
						},
						y: { domain: rs.map((s) => s.label), label: null, tickFormat: label },
						marks: [
							Plot.link(rs, { x1: "typical", x2: "worst", y1: "label", y2: "label", stroke: "#b9b09c", strokeWidth: 2 }),
							Plot.dot(rs, { x: "pair", y: "label", r: 4.5, stroke: INK, strokeWidth: 2, fill: "#f4f0e6" }),
							Plot.dot(rs, { x: "typical", y: "label", r: 5, fill: INK, stroke: "#f4f0e6", strokeWidth: 2 }),
							Plot.tip(
								rs,
								Plot.pointerY({
									x: "typical",
									y: "label",
									title: (s: Sample) =>
										`${s.label}\nAll three systems: ${s.typical.toFixed(1)} ft apart on a typical day, ${s.worst.toFixed(1)} ft on the worst tenth\n` +
										`ECMWF and NOAA alone: ${s.pair.toFixed(1)} ft\nOutlier: ${s.outlier}\nTypical forecast: ${s.mean.toFixed(1)} ft`,
								}),
							),
						],
					}),
				);
				return wrap;
			}),
		);
	};

	tableEl.innerHTML = `<table class="w-full min-w-[820px] text-left text-sm">
		<caption class="pb-2 text-left text-xs text-ink-soft">Wave height three days out, in feet, from each break's offshore sample point. Breaks the models resolve to the same grid cells share a row.</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">Breaks</th><th class="py-2 pr-4">Typical range</th><th class="py-2 pr-4">Worst tenth</th><th class="py-2 pr-4">Persistent</th><th class="py-2 pr-4">Day to day</th><th class="py-2 pr-4">ECMWF v NOAA</th><th class="py-2 pr-4">Outlier</th><th class="py-2">Typical forecast</th>
		</tr></thead><tbody>${REGIONS.flatMap((region) =>
			samples
				.filter((s) => s.region === region)
				.sort((a, b) => b.typical - a.typical)
				.map(
					(s) =>
						`<tr class="border-b border-line/60"><td class="py-2 pr-4">${s.label}<span class="block text-xs text-ink-soft">${REGION_LABEL[region]}</span></td><td class="py-2 pr-4 font-mono">${s.typical.toFixed(2)}</td><td class="py-2 pr-4 font-mono">${s.worst.toFixed(2)}</td><td class="py-2 pr-4 font-mono">${s.systematic.toFixed(2)}</td><td class="py-2 pr-4 font-mono">${s.daily.toFixed(2)}</td><td class="py-2 pr-4 font-mono">${s.pair.toFixed(2)}</td><td class="py-2 pr-4">${s.outlier}</td><td class="py-2 font-mono">${s.mean.toFixed(1)}</td></tr>`,
				),
		).join("")}</tbody></table>`;

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
	const root = document.querySelector<HTMLElement>("#fg-break-disagreement");
	if (root) initBreakDisagreement(root);
});
