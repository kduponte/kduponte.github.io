import type { Observation, Skill } from "../../src/lib/surf-volume/types";
import { lbToKg } from "../../src/lib/surf-volume/taxonomy";

let counter = 0;

export function makeObservation(overrides: Partial<Observation> & { source_id: string; weight_lb: number; skill_normalized: Skill }): Observation {
	counter += 1;
	const weight_lb = overrides.weight_lb;
	return {
		observation_id: `test_${counter}`,
		source_name: overrides.source_id,
		source_url: `https://example.com/${overrides.source_id}`,
		source_type: "manufacturer",
		methodology_family: "test_family",
		collected_at: "2026-01-01",
		collection_method: "manual_entry",
		profile_id: `core_w${weight_lb}_${overrides.skill_normalized}`,
		weight_kg: lbToKg(weight_lb),
		skill_raw: overrides.skill_normalized,
		recommended_volume_min_l: null,
		recommended_volume_max_l: null,
		recommended_volume_point_l: null,
		recommended_volume_display_raw: "",
		volume_to_weight_ratio: null,
		is_directly_comparable: true,
		is_observed: true,
		is_interpolated: false,
		is_derived: false,
		collection_status: "ok",
		...overrides,
	};
}
