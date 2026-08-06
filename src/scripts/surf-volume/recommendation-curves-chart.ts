// Visualization 2 (brief §17): recommendation curves across weight, faceted by the selected
// skill, with source toggles and a consensus curve. Static per Dataset A grid (not tied to the
// live profile) — controls here are local to this chart, not part of the global profile event.
import * as Plot from "@observablehq/plot";
import { computeConsensus } from "../../lib/surf-volume/consensus";
import type { Observation, SourceMetadata } from "../../lib/surf-volume/types";
import { wireTableToggle } from "./chart-utils";
import { loadSurfVolumeData } from "./data-client";

const PALETTE = ["var(--color-accent-blue)", "var(--color-accent-green)", "var(--color-accent-yellow)", "var(--color-ink)", "var(--color-ink-soft)"];

function buildSeries(observations: Observation[], sources: SourceMetadata[], skill: string, activeIds: Set<string>) {
	const coreObs = observations.filter((o) => o.profile_id.startsWith("core_") && o.skill_normalized === skill && o.recommended_volume_point_l !== null);

	const series = sources
		.filter((s) => activeIds.has(s.source_id))
		.flatMap((source, i) =>
			coreObs
				.filter((o) => o.source_id === source.source_id)
				.sort((a, b) => a.weight_lb - b.weight_lb)
				.map((o) => ({
					weight_lb: o.weight_lb,
					volume_l: o.recommended_volume_point_l as number,
					source: source.source_name,
					color: PALETTE[i % PALETTE.length],
					is_directly_comparable: o.is_directly_comparable,
				})),
		);

	// Only directly-comparable observations feed the consensus curve — a source like Surf
	// Simply (a "minimum functional" reference, not a comfort recommendation) is shown as its
	// own line but must never pull the consensus toward a different question than the one the
	// other systems are answering. Matches the exclusion already applied in compare.ts.
	const comparableObs = coreObs.filter((o) => o.is_directly_comparable);
	const byWeight = new Map<number, number[]>();
	for (const o of comparableObs) {
		if (!byWeight.has(o.weight_lb)) byWeight.set(o.weight_lb, []);
		byWeight.get(o.weight_lb)!.push(o.recommended_volume_point_l as number);
	}
	const consensusSeries = [...byWeight.entries()]
		.map(([weight_lb, points]) => ({ weight_lb, volume_l: computeConsensus(points).median }))
		.filter((d) => d.volume_l !== null)
		.sort((a, b) => a.weight_lb - b.weight_lb);

	return { series, consensusSeries };
}

export async function initRecommendationCurvesChart(root: HTMLElement) {
	const { observations, sources } = await loadSurfVolumeData();
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const skillSelect = root.querySelector<HTMLSelectElement>("[data-vg-skill-select]")!;
	const togglesEl = root.querySelector<HTMLElement>("[data-vg-source-toggles]")!;
	wireTableToggle(root);

	const activeIds = new Set(sources.map((s) => s.source_id));
	const hasNonComparable = sources.some((s) => observations.some((o) => o.source_id === s.source_id && !o.is_directly_comparable));
	togglesEl.innerHTML = sources
		.map((s, i) => {
			const isComparable = observations.find((o) => o.source_id === s.source_id)?.is_directly_comparable ?? true;
			return `<label class="inline-flex items-center gap-1.5 text-xs">
			<input type="checkbox" checked data-source-id="${s.source_id}" style="accent-color:${PALETTE[i % PALETTE.length]}" />
			${s.source_name}${isComparable ? "" : ' <span class="text-ink-soft">(reference, dashed)</span>'}
		</label>`;
		})
		.join("");
	if (hasNonComparable) {
		const note = document.createElement("p");
		note.className = "mt-2 max-w-[65ch] font-mono text-[11px] text-ink-soft";
		note.textContent = "Dashed lines mark systems excluded from the consensus curve: they measure a different thing (see Methodology), not an error.";
		togglesEl.insertAdjacentElement("afterend", note);
	}

	function render() {
		const skill = skillSelect.value;
		const { series, consensusSeries } = buildSeries(observations, sources, skill, activeIds);

		if (series.length === 0) {
			chartEl.replaceChildren(document.createTextNode("No sources selected."));
			return;
		}

		const plot = Plot.plot({
			width: chartEl.clientWidth || 640,
			height: 380,
			marginRight: 20,
			x: { label: "Weight (lb)", labelAnchor: "center", grid: true },
			y: { label: "Recommended volume (L)", grid: true },
			color: { legend: false },
			marks: [
				Plot.line(consensusSeries, { x: "weight_lb", y: "volume_l", stroke: "var(--color-ink)", strokeDasharray: "3,3", strokeWidth: 1.5 }),
				...[...activeIds].map((id) => {
					const sourceIndex = sources.findIndex((src) => src.source_id === id);
					const s = series.filter((d) => d.source === sources[sourceIndex]?.source_name);
					const isComparable = s.every((d) => d.is_directly_comparable);
					return Plot.line(s, {
						x: "weight_lb",
						y: "volume_l",
						stroke: PALETTE[sourceIndex % PALETTE.length],
						strokeDasharray: isComparable ? undefined : "6,3",
						strokeOpacity: isComparable ? 1 : 0.6,
					});
				}),
				Plot.dot(series, {
					x: "weight_lb",
					y: "volume_l",
					fill: (d) => (d.is_directly_comparable ? d.color : "var(--color-paper)"),
					stroke: "color",
					r: 3,
					title: (d) => `${d.source}: ${d.volume_l.toFixed(1)} L at ${d.weight_lb} lb${d.is_directly_comparable ? "" : " (not in consensus)"}`,
				}),
			],
		});
		chartEl.replaceChildren(plot);

		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		const weights = [...new Set(series.map((d) => d.weight_lb))].sort((a, b) => a - b);
		const activeSourceNames = sources.filter((s) => activeIds.has(s.source_id));
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Weight</th>${activeSourceNames
					.map((s) => {
						const isComparable = observations.find((o) => o.source_id === s.source_id)?.is_directly_comparable ?? true;
						return `<th class="py-2 pr-4">${s.source_name}${isComparable ? "" : " *"}</th>`;
					})
					.join("")}
			</tr></thead>
			<tbody>${weights
				.map((w) => {
					const cells = activeSourceNames
						.map((s) => {
							const point = series.find((d) => d.weight_lb === w && d.source === s.source_name);
							return `<td class="py-2 pr-4 font-mono">${point ? point.volume_l.toFixed(1) + " L" : "—"}</td>`;
						})
						.join("");
					return `<tr class="border-b border-line/60"><td class="py-2 pr-4">${w} lb</td>${cells}</tr>`;
				})
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
		if (hasNonComparable) {
			const footnote = document.createElement("p");
			footnote.className = "mt-2 font-mono text-[11px] text-ink-soft";
			footnote.textContent = "* Not included in the consensus curve: measures a different thing (see Methodology).";
			tableEl.appendChild(footnote);
		}
	}

	skillSelect.addEventListener("change", render);
	togglesEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((cb) => {
		cb.addEventListener("change", () => {
			const id = cb.dataset.sourceId!;
			if (cb.checked) activeIds.add(id);
			else activeIds.delete(id);
			render();
		});
	});

	render();
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#vg-recommendation-curves");
	if (root) initRecommendationCurvesChart(root);
});
