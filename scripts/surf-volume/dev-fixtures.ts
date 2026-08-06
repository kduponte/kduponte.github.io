// Generates placeholder public/data/surf-volume/*.json from synthetic sources so the frontend
// can be built and verified end-to-end (Milestone M2/M3) before any real data collection has
// happened. Run: npx tsx scripts/surf-volume/dev-fixtures.ts
// This is NOT part of the real collection/normalize/analyze pipeline — it stands in for it.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeComparison } from "../../src/lib/surf-volume/compare";
import { computeConsensus } from "../../src/lib/surf-volume/consensus";
import {
	generateDatasetA,
	generateDatasetBArchetypes,
	generateDatasetBSensitivityVariants,
	generateDatasetC,
} from "../../src/lib/surf-volume/profiles";
import { fitRegression } from "../../src/lib/surf-volume/regression";
import { computeAllScores } from "../../src/lib/surf-volume/scores";
import { lbToKg } from "../../src/lib/surf-volume/taxonomy";
import type { Observation, SampleProfile, SourceMetadata, Skill } from "../../src/lib/surf-volume/types";

const OUT_DIR = path.resolve(import.meta.dirname, "../../public/data/surf-volume");

const RATIOS: Record<string, Record<Skill, number>> = {
	firewire_fake: { beginner: 0.46, intermediate: 0.39, advanced: 0.33 },
	pyzel_fake: { beginner: 0.44, intermediate: 0.37, advanced: 0.31 },
	lost_fake: { beginner: 0.5, intermediate: 0.41, advanced: 0.34 },
	guild_factor_heuristic_fake: { beginner: 0.4, intermediate: 0.4, advanced: 0.4 },
};

const SOURCES: SourceMetadata[] = [
	{
		source_id: "firewire_fake",
		source_name: "Firewire (placeholder)",
		source_url: "https://www.firewiresurfboards.com/pages/prestige-surfboard-volume-calculator",
		source_type: "manufacturer",
		methodology_family: "weight_and_skill_table",
		input_count: 2,
		supports_weight: true,
		supports_height: false,
		supports_age: false,
		supports_gender: false,
		supports_fitness: false,
		supports_frequency: false,
		supports_skill: true,
		supports_wave_type: false,
		supports_wave_size: false,
		supports_wetsuit: false,
		output_type: "range_liters",
		methodology_published: true,
		formula_published: false,
		assumptions_stated: true,
		outputs_reproducible: true,
		requires_login: false,
		automation_status: "not_attempted",
	},
	{
		source_id: "pyzel_fake",
		source_name: "Pyzel (placeholder)",
		source_url: "https://pyzelsurfboards.com/pages/volume-calculator",
		source_type: "manufacturer",
		methodology_family: "weight_and_skill_table",
		input_count: 3,
		supports_weight: true,
		supports_height: false,
		supports_age: true,
		supports_gender: false,
		supports_fitness: false,
		supports_frequency: false,
		supports_skill: true,
		supports_wave_type: false,
		supports_wave_size: false,
		supports_wetsuit: false,
		output_type: "point_liters",
		methodology_published: true,
		formula_published: false,
		assumptions_stated: false,
		outputs_reproducible: true,
		requires_login: false,
		automation_status: "not_attempted",
	},
	{
		source_id: "lost_fake",
		source_name: "Lost (placeholder)",
		source_url: "https://lostsurfboards.net/volume-calculator/",
		source_type: "manufacturer",
		methodology_family: "rich_profile_calculator",
		input_count: 6,
		supports_weight: true,
		supports_height: false,
		supports_age: true,
		supports_gender: false,
		supports_fitness: true,
		supports_frequency: true,
		supports_skill: true,
		supports_wave_type: false,
		supports_wave_size: false,
		supports_wetsuit: false,
		output_type: "point_liters",
		methodology_published: false,
		formula_published: false,
		assumptions_stated: false,
		outputs_reproducible: false,
		requires_login: false,
		automation_status: "not_attempted",
	},
	{
		source_id: "guild_factor_heuristic_fake",
		source_name: "Guild Factor heuristic (placeholder)",
		source_url: "https://www.robertssurf.com/volume-finder.html",
		source_type: "community_heuristic",
		methodology_family: "guild_factor",
		input_count: 1,
		supports_weight: true,
		supports_height: false,
		supports_age: false,
		supports_gender: false,
		supports_fitness: false,
		supports_frequency: false,
		supports_skill: false,
		supports_wave_type: false,
		supports_wave_size: false,
		supports_wetsuit: false,
		output_type: "point_liters",
		methodology_published: true,
		formula_published: true,
		assumptions_stated: true,
		outputs_reproducible: true,
		requires_login: false,
		automation_status: "not_attempted",
	},
];

function computeVolume(sourceId: string, profile: SampleProfile): number {
	const ratio = RATIOS[sourceId][profile.skill];
	let l = lbToKg(profile.weight_lb) * ratio;
	if (sourceId === "lost_fake") {
		if (profile.fitness === "high") l *= 0.96;
		if (profile.fitness === "low") l *= 1.05;
		if (profile.frequency === "frequent") l *= 0.97;
		// A deliberate small discontinuity around weight 200 to exercise the consistency-flag path.
		if (profile.weight_lb >= 200) l += 3;
	}
	return Math.round(l * 10) / 10;
}

function toObservation(sourceId: string, source: SourceMetadata, profile: SampleProfile): Observation {
	const point = computeVolume(sourceId, profile);
	const weightKg = lbToKg(profile.weight_lb);
	return {
		observation_id: `${sourceId}__${profile.profile_id}`,
		source_id: sourceId,
		source_name: source.source_name,
		source_url: source.source_url,
		source_type: source.source_type,
		methodology_family: source.methodology_family,
		collected_at: "2026-08-05",
		collection_method: source.source_type === "community_heuristic" ? "community_heuristic" : "manual_entry",
		profile_id: profile.profile_id,
		weight_lb: profile.weight_lb,
		weight_kg: weightKg,
		height_in: profile.height_in,
		age: profile.age,
		fitness_raw: profile.fitness,
		frequency_raw: profile.frequency,
		skill_raw: profile.skill,
		wave_type_raw: profile.conditions,
		wetsuit_raw: profile.wetsuit,
		fitness_normalized: profile.fitness,
		frequency_normalized: profile.frequency,
		skill_normalized: profile.skill,
		conditions_normalized: profile.conditions,
		wetsuit_normalized: profile.wetsuit,
		recommended_volume_min_l: point,
		recommended_volume_max_l: point,
		recommended_volume_point_l: point,
		recommended_volume_display_raw: `${point} L`,
		volume_to_weight_ratio: point / weightKg,
		is_directly_comparable: true,
		is_observed: true,
		is_interpolated: false,
		is_derived: source.source_type === "community_heuristic",
		collection_status: "ok",
	};
}

async function main() {
	const datasetA = generateDatasetA();
	const archetypes = generateDatasetBArchetypes();
	const variants = generateDatasetBSensitivityVariants();
	const datasetC = generateDatasetC();

	const allProfiles: SampleProfile[] = [...datasetA, ...archetypes, ...variants];
	const observations: Observation[] = [];
	for (const source of SOURCES) {
		const profilesForSource = source.source_id === "lost_fake" ? allProfiles : [...datasetA, ...archetypes];
		for (const profile of profilesForSource) {
			observations.push(toObservation(source.source_id, source, profile));
		}
	}

	const { scores, consistencyFlags } = computeAllScores(SOURCES, observations);

	const modelOutputs = fitRegression(observations, "firewire_fake");

	const profileSummary = computeComparison(datasetC, observations, SOURCES);

	// Agreement-by-profile summary (feeds Visualization 4, the agreement chart).
	const agreementByProfile = datasetA.map((profile) => {
		const points = observations
			.filter((o) => o.profile_id === profile.profile_id && o.recommended_volume_point_l !== null)
			.map((o) => o.recommended_volume_point_l as number);
		return { profile_id: profile.profile_id, weight_lb: profile.weight_lb, skill: profile.skill, ...computeConsensus(points) };
	});

	await mkdir(OUT_DIR, { recursive: true });
	await Promise.all([
		writeFile(path.join(OUT_DIR, "source_metadata.json"), JSON.stringify(SOURCES, null, 2)),
		writeFile(path.join(OUT_DIR, "calculator_observations.json"), JSON.stringify(observations, null, 2)),
		writeFile(path.join(OUT_DIR, "profile_summary.json"), JSON.stringify(profileSummary, null, 2)),
		writeFile(path.join(OUT_DIR, "source_scores.json"), JSON.stringify({ scores, consistencyFlags }, null, 2)),
		writeFile(path.join(OUT_DIR, "model_outputs.json"), JSON.stringify(modelOutputs, null, 2)),
		writeFile(path.join(OUT_DIR, "dataset-b-profiles.json"), JSON.stringify([...archetypes, ...variants], null, 2)),
		writeFile(path.join(OUT_DIR, "dataset-c-default.json"), JSON.stringify(datasetC, null, 2)),
		writeFile(path.join(OUT_DIR, "agreement-by-profile.json"), JSON.stringify(agreementByProfile, null, 2)),
	]);

	console.log(`Wrote fixture data for ${SOURCES.length} synthetic sources, ${observations.length} observations to ${OUT_DIR}`);
	console.log(`THIS IS PLACEHOLDER DATA — sources are fake, do not treat any numbers here as real.`);
}

main();
