// Visualization 3 (brief §17): relative-recommendation heatmap. Rows = system, columns =
// weight/skill profile, cell = % above/below that profile's cross-system median. Centered
// diverging scale (blue = below consensus, yellow = above — no red, it isn't in the token set
// and "more/less volume" isn't an error state). Static per Dataset A grid.
//
// Colors are interpolated manually (see pctToColor/lerpHex below) rather than via Plot's
// `type: "diverging"` scale: that scale interpolates colors using d3-color, which cannot parse
// `var(--color-accent-blue)` as a color (it needs a real hex/rgb value) — passing CSS custom
// properties into it silently produced solid black cells. Resolving the tokens to real hex via
// getComputedStyle and interpolating by hand sidesteps that entirely.
import * as Plot from "@observablehq/plot";
import { computeConsensus } from "../../lib/surf-volume/consensus";
import type { Observation, Skill, SourceMetadata } from "../../lib/surf-volume/types";
import { capitalize, wireTableToggle } from "./chart-utils";
import { loadSurfVolumeData } from "./data-client";

const SKILL_ORDER = ["beginner", "intermediate", "advanced"] as const satisfies readonly Skill[];

export interface HeatmapCell {
	source: string;
	profile: string;
	weight_lb: number;
	skill: Skill;
	pct: number;
}

/**
 * Pure data-shaping for Visualization 3 — independently testable without Plot/SVG rendering.
 * Only directly-comparable sources get a row: a source like Surf Simply measures a different
 * thing (a minimum-functional floor, not a comfort recommendation), so its "deviation from the
 * median" wouldn't mean the same thing as every other row's — showing it here would misleadingly
 * imply it's answering the same question. Excluded here, not just filtered out of the median.
 */
export function buildHeatmapCells(observations: Observation[], sources: SourceMetadata[]): HeatmapCell[] {
	const coreObs = observations.filter((o) => o.profile_id.startsWith("core_") && o.recommended_volume_point_l !== null && o.is_directly_comparable);
	const byProfile = new Map<string, typeof coreObs>();
	for (const o of coreObs) {
		if (!byProfile.has(o.profile_id)) byProfile.set(o.profile_id, []);
		byProfile.get(o.profile_id)!.push(o);
	}

	return coreObs
		.map((o) => {
			const profileObs = byProfile.get(o.profile_id)!;
			const consensus = computeConsensus(profileObs.map((p) => p.recommended_volume_point_l as number));
			if (consensus.median === null) return null;
			const pct = ((o.recommended_volume_point_l as number) - consensus.median) / consensus.median;
			return {
				source: sources.find((s) => s.source_id === o.source_id)?.source_name ?? o.source_id,
				profile: `${o.weight_lb}·${o.skill_normalized[0]?.toUpperCase()}`,
				weight_lb: o.weight_lb,
				skill: o.skill_normalized,
				pct,
			};
		})
		.filter((c): c is HeatmapCell => c !== null);
}

function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.trim().replace("#", "");
	const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
	const n = parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
	return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** Linear RGB interpolation between two hex colors — good enough for a small UI accent gradient. */
export function lerpHex(hexA: string, hexB: string, t: number): string {
	const a = hexToRgb(hexA);
	const b = hexToRgb(hexB);
	return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/** Maps a value in [-1, 1] to a 3-stop diverging color (negative..mid..positive). */
export function pctToColor(t: number, negColor: string, midColor: string, posColor: string): string {
	const clamped = Math.max(-1, Math.min(1, t));
	return clamped < 0 ? lerpHex(midColor, negColor, -clamped) : lerpHex(midColor, posColor, clamped);
}

function resolveToken(name: string, fallback: string): string {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback;
}

function renderLegend(legendEl: HTMLElement, negColor: string, midColor: string, posColor: string, maxAbsPct: number) {
	const pct = (maxAbsPct * 100).toFixed(0);
	legendEl.innerHTML = `
		<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Relative recommendation</p>
		<div class="mt-2 h-3 w-full max-w-xs border border-line" style="background: linear-gradient(to right, ${negColor}, ${midColor}, ${posColor});"></div>
		<div class="mt-1 flex max-w-xs justify-between font-mono text-[11px] text-ink-soft">
			<span>-${pct}%</span>
			<span>0%</span>
			<span>+${pct}%</span>
		</div>
	`;
}

export async function initRelativeHeatmap(root: HTMLElement) {
	const { observations, sources } = await loadSurfVolumeData();
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const legendEl = root.querySelector<HTMLElement>("[data-vg-legend]")!;
	wireTableToggle(root);

	const cells = buildHeatmapCells(observations, sources);
	const maxAbsPct = Math.max(0.01, ...cells.map((c) => Math.abs(c.pct)));

	const negColor = resolveToken("--color-accent-blue", "#2e4a87");
	const midColor = resolveToken("--color-paper", "#f4f0e6");
	const posColor = resolveToken("--color-accent-yellow", "#e3ac3d");

	const coloredCells = cells.map((c) => ({ ...c, color: pctToColor(c.pct / maxAbsPct, negColor, midColor, posColor) }));

	renderLegend(legendEl, negColor, midColor, posColor, maxAbsPct);

	// Faceted into one small heatmap per skill level (beginner/intermediate/advanced, in that
	// order) rather than one wide 21-column chart — a single chart's columns sorted
	// alphabetically by weight·skill label (e.g. "120·A, 120·B, 120·I") put Advanced before
	// Beginner within each weight group, which read as arbitrary rather than a progression.
	const plot = Plot.plot({
		width: chartEl.clientWidth || 640,
		height: sources.length * 36 + 90,
		marginLeft: 160,
		marginBottom: 40,
		fx: { domain: SKILL_ORDER, label: null, tickFormat: capitalize },
		x: { label: "Weight (lb)", labelArrow: "right", tickRotate: -45 },
		y: { label: null },
		marks: [
			Plot.cell(coloredCells, {
				fx: "skill",
				x: "weight_lb",
				y: "source",
				fill: "color", // a literal-color channel (valid CSS colors) — Plot uses these directly, no scale built
				stroke: "var(--color-paper)",
				title: (d) => `${d.source}: ${(d.pct * 100).toFixed(0)}% vs. profile median`,
			}),
		],
	});
	chartEl.replaceChildren(plot);

	const profiles = [...new Set(cells.map((c) => c.profile))].sort((a, b) => {
		const cellA = cells.find((c) => c.profile === a)!;
		const cellB = cells.find((c) => c.profile === b)!;
		const skillDiff = SKILL_ORDER.indexOf(cellA.skill as (typeof SKILL_ORDER)[number]) - SKILL_ORDER.indexOf(cellB.skill as (typeof SKILL_ORDER)[number]);
		return skillDiff !== 0 ? skillDiff : cellA.weight_lb - cellB.weight_lb;
	});
	const sourceNames = [...new Set(cells.map((c) => c.source))];
	const table = document.createElement("table");
	table.className = "w-full text-left text-sm";
	table.innerHTML = `
		<caption class="sr-only">Relative recommendation as percent above/below the profile median, by system and weight·skill profile</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">System</th>${profiles.map((p) => `<th class="py-2 pr-2">${p}</th>`).join("")}
		</tr></thead>
		<tbody>${sourceNames
			.map(
				(s) => `<tr class="border-b border-line/60"><td class="py-2 pr-4">${s}</td>${profiles
					.map((p) => {
						const cell = cells.find((c) => c.source === s && c.profile === p);
						return `<td class="py-2 pr-2 font-mono">${cell ? `${cell.pct >= 0 ? "+" : ""}${(cell.pct * 100).toFixed(0)}%` : "—"}</td>`;
					})
					.join("")}</tr>`,
			)
			.join("")}</tbody>`;
	tableEl.replaceChildren(table);
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#vg-relative-heatmap");
	if (root) initRelativeHeatmap(root);
});
