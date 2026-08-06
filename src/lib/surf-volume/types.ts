// Core data model for "The Volume Gap". Field names deliberately mirror the
// project's raw/processed CSV & JSON schema 1:1 so a human editing a CSV,
// the JSON on disk, and this type all agree without a translation layer.

export type Skill = "beginner" | "intermediate" | "advanced";
export type Fitness = "low" | "average" | "high";
export type Frequency = "occasional" | "weekly" | "frequent";
export type Conditions = "weak_or_small" | "average" | "powerful_or_large";
export type Wetsuit = "none_or_light" | "standard" | "heavy";

export type CollectionMethod =
	| "table_extraction"
	| "browser_automation"
	| "manual_entry"
	| "derived_from_published_ratio"
	| "derived_from_published_formula"
	| "community_heuristic";

export type RecommendationStatus = "observed" | "derived" | "interpolated" | "community_heuristic" | "unavailable";

export type SourceType = "manufacturer" | "educator" | "community_heuristic";

export type OutputType = "point_liters" | "range_liters" | "board_model" | "category";

/** A single row in calculator_observations.{csv,json} — one source's answer for one profile. */
export interface Observation {
	observation_id: string;
	source_id: string;
	source_name: string;
	source_url: string;
	source_country?: string;
	source_region?: string;
	source_type: SourceType;
	methodology_family: string;
	collected_at: string; // ISO date
	collection_method: CollectionMethod;
	source_version_note?: string;

	profile_id: string;

	weight_lb: number;
	weight_kg: number;
	height_in?: number;
	height_cm?: number;
	age?: number;
	gender_raw?: string;
	fitness_raw?: string;
	frequency_raw?: string;
	skill_raw: string;
	wave_type_raw?: string;
	wave_size_raw?: string;
	wetsuit_raw?: string;

	fitness_normalized?: Fitness;
	frequency_normalized?: Frequency;
	skill_normalized: Skill;
	conditions_normalized?: Conditions;
	wetsuit_normalized?: Wetsuit;

	recommended_volume_min_l: number | null;
	recommended_volume_max_l: number | null;
	recommended_volume_point_l: number | null;
	recommended_volume_display_raw: string;

	volume_to_weight_ratio: number | null;
	is_directly_comparable: boolean;
	comparison_exclusion_reason?: string;
	is_observed: boolean;
	is_interpolated: boolean;
	is_derived: boolean;
	collection_status: "ok" | "failed" | "not_applicable";
	collection_notes?: string;
}

/** One row in source_metadata.json — describes a recommendation system, not a specific answer. */
export interface SourceMetadata {
	source_id: string;
	source_name: string;
	source_url: string;
	source_country?: string;
	source_region?: string;
	source_type: SourceType;
	methodology_family: string;
	input_count: number;
	supports_weight: boolean;
	supports_height: boolean;
	supports_age: boolean;
	supports_gender: boolean;
	supports_fitness: boolean;
	supports_frequency: boolean;
	supports_skill: boolean;
	supports_wave_type: boolean;
	supports_wave_size: boolean;
	supports_wetsuit: boolean;
	output_type: OutputType;
	methodology_published: boolean;
	formula_published: boolean;
	/** Extends the brief's literal field list: the transparency rubric (brief §14) names 4 factors
	 *  in prose but only 2 as schema fields. These two close that gap. */
	assumptions_stated: boolean;
	outputs_reproducible: boolean;
	requires_login: boolean;
	automation_status: "not_attempted" | "automated" | "manual_fallback" | "excluded";
}

/** A single answer for a *live*, possibly off-grid, user-entered profile — result of compare.ts. */
export interface LiveProfile {
	weight_lb: number;
	skill: Skill;
	age?: number;
	fitness?: Fitness;
	frequency?: Frequency;
	conditions?: Conditions;
	wetsuit?: Wetsuit;
}

export interface SystemComparisonRow {
	source_id: string;
	source_name: string;
	status: RecommendationStatus;
	recommended_volume_min_l: number | null;
	recommended_volume_max_l: number | null;
	recommended_volume_point_l: number | null;
	volume_to_weight_ratio: number | null;
	deviation_from_consensus_l: number | null;
	deviation_from_consensus_pct: number | null;
}

export interface ConsensusStats {
	median: number | null;
	min: number | null;
	max: number | null;
	q25: number | null;
	q75: number | null;
	iqr: number | null;
	mad: number | null;
	relative_iqr: number | null;
	agreement_label: "high" | "moderate" | "low" | "insufficient_data";
	n_contributing_systems: number;
}

export interface ComparisonResult {
	profile: LiveProfile;
	rows: SystemComparisonRow[];
	consensus: ConsensusStats;
}

export type AgreementLabel = ConsensusStats["agreement_label"];

/** Descriptive, non-ranking behavioral scores for a source — brief §14. 0-1 scale, null = not measurable. */
export interface SourceScores {
	source_id: string;
	complexity: number | null;
	transparency: number | null;
	sensitivity: number | null;
	relative_volume_tendency: number | null; // signed, mean relative_deviation_pct
	consistency: number | null;
	coverage: number | null;
}

export interface RegressionCoefficient {
	term: string;
	estimate: number;
	ci_low: number;
	ci_high: number;
}

/** A profile generated by profiles.ts for the sampling design (brief §11), not a live user input. */
export interface SampleProfile extends LiveProfile {
	profile_id: string;
	dataset: "A" | "B" | "C";
	height_in: number;
	/** Populated for Dataset B archetypes and their one-factor-at-a-time variants. */
	archetype_label?: string;
	/** Populated only for a Dataset B sensitivity variant: which single factor was changed from its archetype base. */
	variant_factor?: "age" | "fitness" | "frequency" | "conditions" | "wetsuit";
}

export interface RegressionOutput {
	coefficients: RegressionCoefficient[];
	r_squared: number;
	cv_rmse: number;
	residuals_by_source: { source_id: string; mean_residual: number; rmse: number }[];
	n_observations: number;
	notes: string[];
}
