// Does disagreement predict error? ECMWF's average miss on each buoy's lowest-spread days through
// its highest-spread days, where spread is the range of the three systems' forecasts. Spread is
// ranked within each buoy, so a sheltered buoy's permanently high spread cannot pass itself off
// as a signal.
import * as Plot from "@observablehq/plot";
import { wireTableToggle } from "../shared/chart-utils";
import { METRES_TO_FEET } from "./data-client";
import { SYSTEM_COLOR } from "./palette";

interface Bin {
	bin: number;
	n: number;
	mean_spread: number;
	mae: number;
}
interface LeadRow {
	lead_days: number;
	n: number;
	bins: Bin[];
	ecmwf_mae: number;
	consensus_mae: number;
}

const BIN_LABEL = ["Lowest fifth", "Second", "Middle", "Fourth", "Highest fifth"];
const LEAD = 3;

export async function initDisagreement(root: HTMLElement) {
	const { rows } = (await fetch("/data/surf-forecast/disagreement.json").then((r) => r.json())) as { rows: LeadRow[] };
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	wireTableToggle(root);

	const lead = rows.find((r) => r.lead_days === LEAD);
	if (!lead) return;
	const bars = lead.bins.map((b) => ({ label: BIN_LABEL[b.bin], mae: b.mae * METRES_TO_FEET, spread: b.mean_spread * METRES_TO_FEET, n: b.n }));
	const overall = lead.ecmwf_mae * METRES_TO_FEET;

	const render = () => {
		const width = Math.min(chartEl.clientWidth || 640, 760);
		chartEl.replaceChildren(
			Plot.plot({
				width,
				height: 280,
				marginLeft: 48,
				x: { domain: BIN_LABEL, label: "Each buoy's days, ranked by how much the three systems disagreed", labelAnchor: "center", padding: 0.55 },
				y: { grid: true, zero: true, label: "ECMWF average miss (ft)", nice: true },
				marks: [
					Plot.barY(bars, { x: "label", y: "mae", fill: SYSTEM_COLOR.ecmwf, rx: 3, insetLeft: 1, insetRight: 1 }),
					Plot.ruleY([overall], { stroke: "#5c5647", strokeWidth: 1 }),
					// A string passed as a channel is read as a field name, so the position goes in the datum.
					Plot.text([{ x: BIN_LABEL[1], y: overall }], {
						x: "x",
						y: "y",
						text: () => `All days: ${overall.toFixed(2)} ft`,
						dy: -8,
						fill: "#5c5647",
						fontSize: 10,
					}),
					Plot.text(bars, { x: "label", y: "mae", text: (d: (typeof bars)[number]) => `${d.mae.toFixed(2)} ft`, dy: -9, fill: "#17140f", fontSize: 11 }),
					Plot.tip(
						bars,
						Plot.pointerX({
							x: "label",
							y: "mae",
							title: (d: (typeof bars)[number]) =>
								`${d.label} of spread\nSystems disagreed by ${d.spread.toFixed(2)} ft on average\nECMWF missed by ${d.mae.toFixed(2)} ft\n${d.n.toLocaleString()} forecasts`,
						}),
					),
				],
			}),
		);
	};

	tableEl.innerHTML = `<table class="w-full min-w-[560px] text-left text-sm">
		<caption class="pb-2 text-left text-xs text-ink-soft">Wave height, by days ahead. Spread is the range of the ECMWF, NOAA and DWD forecasts, ranked within each buoy.</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">Days ahead</th>${BIN_LABEL.map((l) => `<th class="py-2 pr-3">${l}</th>`).join("")}<th class="py-2 pr-3">Average of all three</th><th class="py-2">ECMWF alone</th>
		</tr></thead><tbody>${rows
			.map(
				(r) =>
					`<tr class="border-b border-line/60"><td class="py-2 pr-4">${r.lead_days}</td>${r.bins
						.map((b) => `<td class="py-2 pr-3 font-mono">${(b.mae * METRES_TO_FEET).toFixed(2)} <span class="text-ink-soft">(spread ${(b.mean_spread * METRES_TO_FEET).toFixed(1)})</span></td>`)
						.join("")}<td class="py-2 pr-3 font-mono">${(r.consensus_mae * METRES_TO_FEET).toFixed(2)}</td><td class="py-2 font-mono">${(r.ecmwf_mae * METRES_TO_FEET).toFixed(2)}</td></tr>`,
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
	const root = document.querySelector<HTMLElement>("#fg-disagreement");
	if (root) initDisagreement(root);
});
