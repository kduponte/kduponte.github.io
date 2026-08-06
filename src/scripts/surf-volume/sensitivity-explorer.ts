// Visualization 7 (optional in the brief, included for this v1): lets a visitor vary one input
// at a time around an archetype. Honesty constraint (plan §4): this cannot live-recompute
// against opaque browser-automated sources (no live scraping in prod) — it looks up the
// pre-collected Dataset B one-factor-at-a-time observations and shows "unavailable" for any
// level that wasn't actually collected for that source.
import type { Observation } from "../../lib/surf-volume/types";
import { formatL } from "./chart-utils";
import { loadSurfVolumeData } from "./data-client";

const VARIABLES = ["age", "fitness", "frequency", "conditions", "wetsuit"] as const;
type Variable = (typeof VARIABLES)[number];

const ARCHETYPES = [
	{ slug: "new_learner", label: "New learner" },
	{ slug: "larger_new_learner", label: "Larger new learner" },
	{ slug: "weekend_intermediate", label: "Weekend intermediate" },
	{ slug: "fit_frequent_intermediate", label: "Fit frequent intermediate" },
	{ slug: "older_experienced_surfer", label: "Older experienced surfer" },
	{ slug: "fit_advanced_surfer", label: "Fit advanced surfer" },
];

export async function initSensitivityExplorer(root: HTMLElement) {
	const { observations, sources } = await loadSurfVolumeData();

	const sourceIdsWithVariants = new Set(observations.filter((o) => o.profile_id.startsWith("sens_")).map((o) => o.source_id));
	const eligibleSources = sources.filter((s) => sourceIdsWithVariants.has(s.source_id));

	const sourceSelect = root.querySelector<HTMLSelectElement>("[data-vg-source-select]")!;
	const archetypeSelect = root.querySelector<HTMLSelectElement>("[data-vg-archetype-select]")!;
	const variableSelect = root.querySelector<HTMLSelectElement>("[data-vg-variable-select]")!;
	const resultEl = root.querySelector<HTMLElement>("[data-vg-result]")!;
	const noteEl = root.querySelector<HTMLElement>("[data-vg-note]")!;

	if (eligibleSources.length === 0) {
		root.querySelector<HTMLElement>("[data-vg-controls]")!.hidden = true;
		resultEl.textContent = "No systems with collected profile-variation data yet.";
		return;
	}

	sourceSelect.innerHTML = eligibleSources.map((s) => `<option value="${s.source_id}">${s.source_name}</option>`).join("");
	archetypeSelect.innerHTML = ARCHETYPES.map((a) => `<option value="${a.slug}">${a.label}</option>`).join("");
	variableSelect.innerHTML = VARIABLES.map((v) => `<option value="${v}">${v[0].toUpperCase()}${v.slice(1)}</option>`).join("");

	function findObs(sourceId: string, profileId: string): Observation | undefined {
		return observations.find((o) => o.source_id === sourceId && o.profile_id === profileId);
	}

	function render() {
		const sourceId = sourceSelect.value;
		const archetypeSlug = archetypeSelect.value;
		const variable = variableSelect.value as Variable;

		const base = findObs(sourceId, archetypeSlug);
		const variants = observations.filter((o) => o.source_id === sourceId && o.profile_id.startsWith(`sens_${archetypeSlug}_${variable}_`));

		const isHeuristic = sources.find((s) => s.source_id === sourceId)?.source_type === "community_heuristic";
		noteEl.textContent = isHeuristic
			? "This is a pure formula, so this really does recompute live from the published rule."
			: "Based on pre-collected profile variations for this system, not a live recalculation.";

		const points = [
			base ? { label: "Base", value: base.recommended_volume_point_l } : null,
			...variants.map((v) => ({ label: v.profile_id.split(`${variable}_`)[1] ?? v.profile_id, value: v.recommended_volume_point_l })),
		].filter((p): p is { label: string; value: number | null } => p !== null);

		if (points.length === 0) {
			resultEl.innerHTML = `<p class="text-sm text-ink-soft">Unavailable: this variation wasn't collected for this system.</p>`;
			return;
		}

		resultEl.innerHTML = `<div class="flex flex-wrap gap-4">${points
			.map(
				(p) => `<div class="border border-line px-4 py-3">
				<p class="font-mono text-[11px] uppercase tracking-wide text-ink-soft">${p.label}</p>
				<p class="mt-1 font-display text-lg">${formatL(p.value)}</p>
			</div>`,
			)
			.join("")}</div>`;
	}

	[sourceSelect, archetypeSelect, variableSelect].forEach((el) => el.addEventListener("change", render));
	render();
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#vg-sensitivity-explorer");
	if (root) initSensitivityExplorer(root);
});
