// The single function that powers both the frozen personal-default comparison (baked into
// public/data/surf-volume/profile_summary.json at build time) and the live hero demo
// (recomputed in the browser as the visitor edits their profile). One implementation,
// tested once — no drift between "what the static charts show" and "what the demo computes".
import { computeConsensus } from "./consensus";
import { interpolateWeight } from "./interpolate";
import { labVolumeToWeightRatio, lbToKg } from "./taxonomy";
import type { ComparisonResult, LiveProfile, Observation, SourceMetadata, SystemComparisonRow } from "./types";

export function computeComparison(
	profile: LiveProfile,
	observations: Observation[],
	sources: SourceMetadata[],
): ComparisonResult {
	const rows: SystemComparisonRow[] = sources.map((source) => {
		const candidates = observations.filter(
			(o) => o.source_id === source.source_id && o.skill_normalized === profile.skill && o.is_directly_comparable,
		);

		const interpolated = interpolateWeight(candidates, profile.weight_lb);

		if (!interpolated) {
			return {
				source_id: source.source_id,
				source_name: source.source_name,
				status: "unavailable",
				recommended_volume_min_l: null,
				recommended_volume_max_l: null,
				recommended_volume_point_l: null,
				volume_to_weight_ratio: null,
				deviation_from_consensus_l: null,
				deviation_from_consensus_pct: null,
			};
		}

		const isHeuristic = source.source_type === "community_heuristic";
		const status = isHeuristic ? "community_heuristic" : interpolated.wasExactMatch ? "observed" : "interpolated";
		const weightKg = lbToKg(profile.weight_lb);

		return {
			source_id: source.source_id,
			source_name: source.source_name,
			status,
			recommended_volume_min_l: interpolated.value,
			recommended_volume_max_l: interpolated.value,
			recommended_volume_point_l: interpolated.value,
			volume_to_weight_ratio: labVolumeToWeightRatio(interpolated.value, weightKg),
			deviation_from_consensus_l: null, // filled in below once consensus is known
			deviation_from_consensus_pct: null,
		};
	});

	const comparablePoints = rows
		.filter((r) => r.recommended_volume_point_l !== null)
		.map((r) => r.recommended_volume_point_l as number);
	const consensus = computeConsensus(comparablePoints);

	const rowsWithDeviation = rows.map((r) => {
		if (r.recommended_volume_point_l === null || consensus.median === null) return r;
		const deviationL = r.recommended_volume_point_l - consensus.median;
		return {
			...r,
			deviation_from_consensus_l: deviationL,
			deviation_from_consensus_pct: consensus.median !== 0 ? deviationL / consensus.median : null,
		};
	});

	return { profile, rows: rowsWithDeviation, consensus };
}
