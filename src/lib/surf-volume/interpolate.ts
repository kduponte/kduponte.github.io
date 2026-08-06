// Brief §15 interpolation policy: linear interpolation across weight ONLY, within the
// same source and normalized skill category. Never extrapolates beyond the collected
// range, never interpolates across skill levels, never invents unsupported adjustments
// for age/fitness/wave/wetsuit — those either match an observed profile or are unavailable.
import type { Observation } from "./types";

export interface InterpolationResult {
	value: number;
	wasExactMatch: boolean;
}

/**
 * `candidates` must already be filtered to a single source_id + skill_normalized, and to
 * observations that are directly comparable with a non-null point estimate. Returns null
 * when targetWeightLb falls outside the observed weight range (no extrapolation) or when
 * there are fewer than 2 candidates to interpolate between (and no exact match).
 */
export function interpolateWeight(candidates: Observation[], targetWeightLb: number): InterpolationResult | null {
	if (candidates.length === 0) return null;

	const exact = candidates.find((c) => c.weight_lb === targetWeightLb);
	if (exact && exact.recommended_volume_point_l !== null) {
		return { value: exact.recommended_volume_point_l, wasExactMatch: true };
	}

	const sorted = [...candidates]
		.filter((c) => c.recommended_volume_point_l !== null)
		.sort((a, b) => a.weight_lb - b.weight_lb);
	if (sorted.length < 2) return null;

	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	if (targetWeightLb < min.weight_lb || targetWeightLb > max.weight_lb) return null; // no extrapolation

	let lower = sorted[0];
	let upper = sorted[sorted.length - 1];
	for (let i = 0; i < sorted.length - 1; i++) {
		if (sorted[i].weight_lb <= targetWeightLb && sorted[i + 1].weight_lb >= targetWeightLb) {
			lower = sorted[i];
			upper = sorted[i + 1];
			break;
		}
	}
	if (lower.weight_lb === upper.weight_lb) {
		return { value: lower.recommended_volume_point_l as number, wasExactMatch: true };
	}
	const frac = (targetWeightLb - lower.weight_lb) / (upper.weight_lb - lower.weight_lb);
	const value =
		(lower.recommended_volume_point_l as number) +
		frac * ((upper.recommended_volume_point_l as number) - (lower.recommended_volume_point_l as number));
	return { value, wasExactMatch: false };
}
