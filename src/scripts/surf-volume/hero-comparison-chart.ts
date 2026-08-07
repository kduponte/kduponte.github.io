// Visualization 1 (brief §17): the hero dot-and-range plot. One row per system, a consensus
// line, a middle-50% band, and a paired accessible table. Re-renders on every profile change.
import * as Plot from "@observablehq/plot";
import type { ComparisonResult } from "../../lib/surf-volume/types";
import { STATUS_LABEL } from "../../lib/surf-volume/format";
import { formatL, wireTableToggle } from "../shared/chart-utils";
import { onProfileChange } from "./state";

const STATUS_COLOR: Record<string, string> = {
	observed: "var(--color-accent-blue)",
	derived: "var(--color-accent-blue)",
	interpolated: "var(--color-ink-soft)",
	community_heuristic: "var(--color-accent-green)",
	unavailable: "var(--color-line)",
};

function render(container: HTMLElement, result: ComparisonResult) {
	const rows = result.rows.filter((r) => r.recommended_volume_point_l !== null);

	if (rows.length === 0) {
		container.replaceChildren(document.createTextNode("No comparable systems for this profile yet."));
		return;
	}

	const sorted = [...rows].sort((a, b) => (a.recommended_volume_point_l ?? 0) - (b.recommended_volume_point_l ?? 0));

	const plot = Plot.plot({
		marginLeft: 160,
		height: Math.max(180, sorted.length * 34),
		width: container.clientWidth || 640,
		x: { label: "Recommended volume (L)", grid: true },
		y: { domain: sorted.map((r) => r.source_name), label: null },
		marks: [
			result.consensus.q25 !== null && result.consensus.q75 !== null
				? Plot.rectY([{ x1: result.consensus.q25, x2: result.consensus.q75 }], {
						x1: "x1",
						x2: "x2",
						y1: -1,
						y2: sorted.length,
						fill: "var(--color-accent-yellow)",
						fillOpacity: 0.12,
					})
				: null,
			result.consensus.median !== null
				? Plot.ruleX([result.consensus.median], { stroke: "var(--color-ink)", strokeDasharray: "3,3" })
				: null,
			Plot.ruleY(sorted, { y: "source_name", stroke: "var(--color-line)" }),
			Plot.dot(sorted, {
				x: "recommended_volume_point_l",
				y: "source_name",
				r: 5,
				fill: (d) => STATUS_COLOR[d.status] ?? "var(--color-ink)",
				title: (d) => `${d.source_name}: ${formatL(d.recommended_volume_point_l)} (${STATUS_LABEL[d.status as keyof typeof STATUS_LABEL]})`,
			}),
		].filter(Boolean),
	});
	container.replaceChildren(plot);
}

function renderTable(container: HTMLElement, result: ComparisonResult) {
	const rows = result.rows;
	const table = document.createElement("table");
	table.className = "w-full text-left text-sm";
	table.innerHTML = `
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">System</th><th class="py-2 pr-4">Recommendation</th><th class="py-2 pr-4">Status</th><th class="py-2">Vs. consensus</th>
		</tr></thead>
		<tbody>${rows
			.map(
				(r) => `<tr class="border-b border-line/60">
			<td class="py-2 pr-4">${r.source_name}</td>
			<td class="py-2 pr-4 font-mono">${formatL(r.recommended_volume_point_l)}</td>
			<td class="py-2 pr-4 text-ink-soft">${STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}</td>
			<td class="py-2 font-mono text-ink-soft">${r.deviation_from_consensus_pct === null ? "—" : `${r.deviation_from_consensus_pct >= 0 ? "+" : ""}${(r.deviation_from_consensus_pct * 100).toFixed(0)}%`}</td>
		</tr>`,
			)
			.join("")}</tbody>`;
	container.replaceChildren(table);
}

function renderSummary(summaryEl: HTMLElement, result: ComparisonResult) {
	const c = result.consensus;
	const unavailableCount = result.rows.filter((r) => r.recommended_volume_point_l === null).length;
	const unavailableNote = unavailableCount > 0 ? ` · ${unavailableCount} system${unavailableCount === 1 ? "" : "s"} unavailable for this profile` : "";
	if (c.median === null) {
		summaryEl.textContent = `Not enough comparable systems for this profile to compute a consensus.${unavailableNote}`;
		return;
	}
	summaryEl.innerHTML = `
		<span class="font-display text-2xl text-ink">${c.median.toFixed(1)} L</span>
		<span class="ml-2 text-sm text-ink-soft">consensus · middle 50%: ${c.q25?.toFixed(0)}–${c.q75?.toFixed(0)} L · range: ${c.min?.toFixed(0)}–${c.max?.toFixed(0)} L · ${c.n_contributing_systems} systems · agreement: ${c.agreement_label.replace("_", " ")}${unavailableNote}</span>
	`;
}

export function initHeroComparisonChart(root: HTMLElement) {
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	onProfileChange((result) => {
		render(chartEl, result);
		renderTable(tableEl, result);
		renderSummary(summaryEl, result);
	});
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#vg-hero-comparison");
	if (root) initHeroComparisonChart(root);
});
