import type { Conditions, Fitness, Frequency, Skill, Wetsuit } from "./types";

export const SKILLS: Skill[] = ["beginner", "intermediate", "advanced"];
export const FITNESS_LEVELS: Fitness[] = ["low", "average", "high"];
export const FREQUENCIES: Frequency[] = ["occasional", "weekly", "frequent"];
export const CONDITIONS: Conditions[] = ["weak_or_small", "average", "powerful_or_large"];
export const WETSUITS: Wetsuit[] = ["none_or_light", "standard", "heavy"];

/** Presentation conventions for cross-system agreement, not a scientific threshold. Brief §13. */
export const AGREEMENT_THRESHOLDS = {
	high: 0.08,
	moderate: 0.16,
} as const;

export interface TaxonomyMapping {
	source_id: string;
	field: "skill" | "fitness" | "frequency" | "conditions" | "wetsuit";
	original_value: string;
	normalized_value: string;
	rationale: string;
	confidence: "high" | "medium" | "low";
}

export function labVolumeToWeightRatio(volumeL: number | null, weightKg: number): number | null {
	if (volumeL === null || weightKg <= 0) return null;
	return volumeL / weightKg;
}

export function lbToKg(lb: number): number {
	return lb * 0.45359237;
}

export function kgToLb(kg: number): number {
	return kg / 0.45359237;
}

export function inToCm(inches: number): number {
	return inches * 2.54;
}
