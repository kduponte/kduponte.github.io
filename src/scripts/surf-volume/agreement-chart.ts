// Visualization 4 (brief §17): calculator disagreement by weight and skill, as an IQR ribbon
// around the consensus median, faceted by skill. Static per Dataset A grid.
import * as Plot from "@observablehq/plot";
import { computeConsensus } from "../../lib/surf-volume/consensus";
import { capitalize, wireTableToggle } from "../shared/chart-utils";
import { loadSurfVolumeData } from "./data-client";

const SKILL_ORDER = ["beginner", "intermediate", "advanced"] as const;

export async function initAgreementChart(root: HTMLElement) {
	const { observations } = await loadSurfVolumeData();
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	wireTableToggle(root);

	// is_directly_comparable is required here: a source like Surf Simply measures a different
	// thing (a minimum-functional floor, not a comfort recommendation) and would otherwise
	// distort the IQR band it's excluded from everywhere else (compare.ts, the hero section).
	const coreObs = observations.filter((o) => o.profile_id.startsWith("core_") && o.recommended_volume_point_l !== null && o.is_directly_comparable);
	const byProfile = new Map<string, { weight_lb: number; skill: string; points: number[] }>();
	for (const o of coreObs) {
		if (!byProfile.has(o.profile_id)) byProfile.set(o.profile_id, { weight_lb: o.weight_lb, skill: o.skill_normalized, points: [] });
		byProfile.get(o.profile_id)!.points.push(o.recommended_volume_point_l as number);
	}

	const rows = [...byProfile.values()]
		.map(({ weight_lb, skill, points }) => {
			const c = computeConsensus(points);
			return { weight_lb, skill, median: c.median, q25: c.q25, q75: c.q75, relative_iqr: c.relative_iqr, agreement_label: c.agreement_label, n: c.n_contributing_systems };
		})
		.filter((r) => r.median !== null)
		.sort((a, b) => {
			const skillDiff = SKILL_ORDER.indexOf(a.skill as (typeof SKILL_ORDER)[number]) - SKILL_ORDER.indexOf(b.skill as (typeof SKILL_ORDER)[number]);
			return skillDiff !== 0 ? skillDiff : a.weight_lb - b.weight_lb;
		});

	const plot = Plot.plot({
		width: chartEl.clientWidth || 640,
		height: 260,
		facet: { data: rows, x: "skill" },
		fx: { domain: SKILL_ORDER, label: null, tickFormat: capitalize },
		x: { label: "Weight (lb)", labelAnchor: "center" },
		y: { label: "Recommended volume (L)", grid: true },
		marks: [
			Plot.areaY(rows, { x: "weight_lb", y1: "q25", y2: "q75", fill: "var(--color-accent-blue)", fillOpacity: 0.15 }),
			Plot.line(rows, { x: "weight_lb", y: "median", stroke: "var(--color-ink)" }),
			Plot.dot(rows, { x: "weight_lb", y: "median", r: 2.5, fill: "var(--color-ink)", title: (d) => `${d.weight_lb} lb: median ${d.median?.toFixed(1)} L, IQR ${d.q25?.toFixed(0)}–${d.q75?.toFixed(0)} L (${d.agreement_label} agreement, n=${d.n})` }),
		],
	});
	chartEl.replaceChildren(plot);

	const table = document.createElement("table");
	table.className = "w-full text-left text-sm";
	table.innerHTML = `
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">Skill</th><th class="py-2 pr-4">Weight</th><th class="py-2 pr-4">Median</th><th class="py-2 pr-4">Middle 50%</th><th class="py-2 pr-4">Agreement</th><th class="py-2">Systems</th>
		</tr></thead>
		<tbody>${rows
			.map(
				(r) => `<tr class="border-b border-line/60">
			<td class="py-2 pr-4">${capitalize(r.skill)}</td>
			<td class="py-2 pr-4 font-mono">${r.weight_lb} lb</td>
			<td class="py-2 pr-4 font-mono">${r.median?.toFixed(1)} L</td>
			<td class="py-2 pr-4 font-mono">${r.q25?.toFixed(0)}–${r.q75?.toFixed(0)} L</td>
			<td class="py-2 pr-4 text-ink-soft">${r.agreement_label.replace("_", " ")}</td>
			<td class="py-2 font-mono text-ink-soft">${r.n}</td>
		</tr>`,
			)
			.join("")}</tbody>`;
	tableEl.replaceChildren(table);
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#vg-agreement-chart");
	if (root) initAgreementChart(root);
});
