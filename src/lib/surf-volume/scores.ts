// Descriptive, non-ranking behavioral scores — brief §14. Every rubric here is explicit and
// documented in Methodology.astro. Scores characterize behavior, not quality; "not measurable"
// (null) is always distinct from a real 0, so a source is never penalized for data we don't have.
import { computeConsensus } from "./consensus";
import type { Observation, SourceMetadata, SourceScores } from "./types";

const SUPPORTS_FIELDS: (keyof SourceMetadata)[] = [
	"supports_weight",
	"supports_height",
	"supports_age",
	"supports_gender",
	"supports_fitness",
	"supports_frequency",
	"supports_skill",
	"supports_wave_type",
	"supports_wave_size",
	"supports_wetsuit",
];

function minMaxNormalize(values: number[], value: number): number {
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (max === min) return 0.5; // no spread across sources: not meaningfully more/less complex than peers
	return (value - min) / (max - min);
}

export function complexityScore(sources: SourceMetadata[], source: SourceMetadata): number {
	return minMaxNormalize(
		sources.map((s) => s.input_count),
		source.input_count,
	);
}

export function transparencyScore(source: SourceMetadata): number {
	const factors = [
		source.methodology_published,
		source.formula_published,
		source.assumptions_stated,
		source.outputs_reproducible,
	];
	return factors.filter(Boolean).length / factors.length;
}

export function coverageScore(source: SourceMetadata): number {
	return SUPPORTS_FIELDS.filter((f) => source[f] === true).length / SUPPORTS_FIELDS.length;
}

/**
 * Mean absolute percent change in recommendation across the Dataset B one-factor-at-a-time
 * variants, relative to that variant's archetype base. Returns null (not 0) when a source has
 * no collected sensitivity variants — that source's sensitivity simply isn't measurable, it
 * is not assumed to be zero/insensitive.
 */
export function sensitivityScore(sourceId: string, allObservations: Observation[]): number | null {
	const basesByProfile = new Map(
		allObservations
			.filter(
				(o) =>
					o.source_id === sourceId &&
					o.recommended_volume_point_l !== null &&
					!o.profile_id.startsWith("core_") &&
					!o.profile_id.startsWith("sens_"),
			)
			.map((o) => [o.profile_id, o.recommended_volume_point_l as number]),
	);
	const changes: number[] = [];
	for (const variant of allObservations) {
		if (variant.source_id !== sourceId || !variant.profile_id.startsWith("sens_") || variant.recommended_volume_point_l === null)
			continue;
		const archetypeSlug = variant.profile_id.replace(/^sens_/, "").split(/_(?:age|fitness|frequency|conditions|wetsuit)_/)[0];
		const base = basesByProfile.get(archetypeSlug);
		if (base === undefined || base === 0) continue;
		changes.push(Math.abs((variant.recommended_volume_point_l - base) / base));
	}
	if (changes.length === 0) return null;
	return changes.reduce((a, b) => a + b, 0) / changes.length;
}

/**
 * Mean relative_deviation_pct across Dataset A profiles where this source is directly
 * comparable — a signed, descriptive "tends to recommend more/less than the pack" figure.
 * Never called "accuracy" or "bias" in UI copy (brief §16B).
 */
export function relativeVolumeTendencyScore(sourceId: string, allObservations: Observation[]): number | null {
	const byProfile = new Map<string, Observation[]>();
	for (const o of allObservations) {
		if (!o.profile_id.startsWith("core_") || !o.is_directly_comparable || o.recommended_volume_point_l === null) continue;
		if (!byProfile.has(o.profile_id)) byProfile.set(o.profile_id, []);
		byProfile.get(o.profile_id)!.push(o);
	}
	const deviations: number[] = [];
	for (const obsForProfile of byProfile.values()) {
		const sourceObs = obsForProfile.find((o) => o.source_id === sourceId);
		if (!sourceObs || sourceObs.recommended_volume_point_l === null) continue;
		const consensus = computeConsensus(obsForProfile.map((o) => o.recommended_volume_point_l as number));
		if (consensus.median === null || consensus.median === 0) continue;
		deviations.push((sourceObs.recommended_volume_point_l - consensus.median) / consensus.median);
	}
	if (deviations.length === 0) return null;
	return deviations.reduce((a, b) => a + b, 0) / deviations.length;
}

export interface ConsistencyFlag {
	source_id: string;
	skill: string;
	from_weight_lb: number;
	to_weight_lb: number;
	jump_l: number;
}

/**
 * Fraction of adjacent-weight pairs (within the same skill) that don't decrease, across
 * Dataset A. A source with no non-monotonic steps and no outsized jumps scores 1.0.
 * Flags (returned separately, not folded into the score) mark jumps > 2x the source's own
 * median step size — descriptive, never auto-labeled an "error" (brief §14/§16D).
 */
export function consistencyScore(sourceId: string, allObservations: Observation[]): { score: number | null; flags: ConsistencyFlag[] } {
	const bySkill = new Map<string, Observation[]>();
	for (const o of allObservations) {
		if (o.source_id !== sourceId || !o.profile_id.startsWith("core_") || o.recommended_volume_point_l === null) continue;
		if (!bySkill.has(o.skill_normalized)) bySkill.set(o.skill_normalized, []);
		bySkill.get(o.skill_normalized)!.push(o);
	}
	if (bySkill.size === 0) return { score: null, flags: [] };

	let steps: number[] = [];
	const stepsBySkill = new Map<string, { fromWeight: number; toWeight: number; step: number }[]>();
	for (const [skill, obs] of bySkill) {
		const sortedObs = [...obs].sort((a, b) => a.weight_lb - b.weight_lb);
		const skillSteps: { fromWeight: number; toWeight: number; step: number }[] = [];
		for (let i = 1; i < sortedObs.length; i++) {
			const step = (sortedObs[i].recommended_volume_point_l as number) - (sortedObs[i - 1].recommended_volume_point_l as number);
			skillSteps.push({ fromWeight: sortedObs[i - 1].weight_lb, toWeight: sortedObs[i].weight_lb, step });
			steps.push(step);
		}
		stepsBySkill.set(skill, skillSteps);
	}
	if (steps.length === 0) return { score: null, flags: [] };

	const medianAbsStep = [...steps.map(Math.abs)].sort((a, b) => a - b)[Math.floor(steps.length / 2)];
	const nonDecreasing = steps.filter((s) => s >= 0).length;
	const score = nonDecreasing / steps.length;

	const flags: ConsistencyFlag[] = [];
	for (const [skill, skillSteps] of stepsBySkill) {
		for (const { fromWeight, toWeight, step } of skillSteps) {
			if (medianAbsStep > 0 && Math.abs(step) > 2 * medianAbsStep) {
				flags.push({ source_id: sourceId, skill, from_weight_lb: fromWeight, to_weight_lb: toWeight, jump_l: step });
			}
		}
	}
	return { score, flags };
}

/** `observations` should be the full, unfiltered observation set — each score function
 *  internally selects the dataset slice (core grid vs. archetype vs. sensitivity variant) it needs. */
export function computeAllScores(
	sources: SourceMetadata[],
	observations: Observation[],
): { scores: SourceScores[]; consistencyFlags: ConsistencyFlag[] } {
	const scores: SourceScores[] = [];
	const allFlags: ConsistencyFlag[] = [];
	for (const source of sources) {
		const { score: consistency, flags } = consistencyScore(source.source_id, observations);
		allFlags.push(...flags);
		scores.push({
			source_id: source.source_id,
			complexity: complexityScore(sources, source),
			transparency: transparencyScore(source),
			sensitivity: sensitivityScore(source.source_id, observations),
			relative_volume_tendency: relativeVolumeTendencyScore(source.source_id, observations),
			consistency,
			coverage: coverageScore(source),
		});
	}
	return { scores, consistencyFlags: allFlags };
}
