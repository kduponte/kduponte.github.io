// Turns per-source raw CSVs (data/surf-volume/raw/*.csv, one heterogeneous shape per source)
// into the single unified Observation schema (data/surf-volume/processed/calculator_observations.*).
// Never overwrites raw observations — this only reads raw/ and writes processed/.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv, fromCsv } from "../lib/csv.ts";
import { SOURCE_METADATA } from "./source-metadata.ts";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy.ts";
import type { Observation, Skill } from "../../../src/lib/surf-volume/types.ts";

const RAW_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/raw");
const PROCESSED_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/processed");

function coreProfileId(weightLb: number, skill: string): string {
	return `core_w${weightLb}_${skill}`;
}

function baseFields(
	sourceId: string,
	profileId: string,
	weightLb: number,
	skill: Skill,
	collectedAt: string,
	method: Observation["collection_method"],
) {
	const source = SOURCE_METADATA.find((s) => s.source_id === sourceId);
	if (!source) throw new Error(`normalize: no SourceMetadata for source_id "${sourceId}" — add it to source-metadata.ts`);
	return {
		observation_id: `${sourceId}__${profileId}`,
		source_id: sourceId,
		source_name: source.source_name,
		source_url: source.source_url,
		source_country: source.source_country,
		source_type: source.source_type,
		methodology_family: source.methodology_family,
		collected_at: collectedAt,
		collection_method: method,
		profile_id: profileId,
		weight_lb: weightLb,
		weight_kg: Math.round(lbToKg(weightLb) * 100) / 100,
		skill_normalized: skill,
		is_observed: method === "table_extraction" || method === "browser_automation" || method === "manual_entry",
		is_derived: method === "derived_from_published_ratio" || method === "derived_from_published_formula" || method === "community_heuristic",
		is_interpolated: false,
		collection_status: "ok" as const,
	};
}

async function normalizeFirewire(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "firewire_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("firewire", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "table_extraction"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: r.recommended_volume_display_raw,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: true,
			collection_notes: "One of Firewire's 5 published skill tiers (Beginner/Intermediate/Advanced used directly; Inter/Beg and Advan/Inter hybrid tiers skipped — see normalization_rules.md).",
		} satisfies Observation;
	});
}

async function normalizeSurfSimply(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "surf_simply_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("surf_simply", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_ratio"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: Number(r.recommended_volume_min_l),
			recommended_volume_max_l: Number(r.recommended_volume_max_l),
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${r.recommended_volume_min_l}-${r.recommended_volume_max_l} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			comparison_exclusion_reason: r.comparison_exclusion_reason,
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeRoberts(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "roberts_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("roberts", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: Number(r.recommended_volume_min_l),
			recommended_volume_max_l: Number(r.recommended_volume_max_l),
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L (GF ${r.guild_factor})`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeLost(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "lost_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("lost", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: Number(r.recommended_volume_min_l),
			recommended_volume_max_l: Number(r.recommended_volume_max_l),
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeRusty(): Promise<Observation[]> {
	// rusty_raw.csv carries its own profile_id (Dataset A + Dataset B archetypes + the age/
	// fitness/frequency B variants — the only ones Rusty's form can express).
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "rusty_raw.csv"), "utf-8"));
	return raw
		.filter((r) => r.collection_status === "ok")
		.map((r) => {
			const point = Number(r.recommended_volume_point_l);
			const weightKg = lbToKg(Number(r.weight_lb));
			return {
				...baseFields("rusty", r.profile_id, Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "browser_automation"),
				skill_raw: r.skill_source_label,
				height_in: Math.round((Number(r.height_cm_input) / 2.54) * 10) / 10,
				age: Number(r.age),
				recommended_volume_min_l: Number(r.recommended_volume_min_l),
				recommended_volume_max_l: Number(r.recommended_volume_max_l),
				recommended_volume_point_l: point,
				recommended_volume_display_raw: `${r.recommended_volume_min_l}-${r.recommended_volume_max_l} L`,
				volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
				is_directly_comparable: true,
				collection_notes: r.notes,
			} satisfies Observation;
		});
}

async function normalizeJs(): Promise<Observation[]> {
	// js_raw.csv carries its own profile_id (Dataset A + Dataset B archetypes + Dataset B
	// sensitivity variants — the formula is continuous, so every profile is computable at zero
	// collection cost, unlike Rusty which needs a live request per profile).
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "js_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("js_industries", r.profile_id, Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_normalized,
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: true,
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeGuildFactorHeuristic(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "heuristic_guild_factor_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("guild_factor_heuristic", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_ratio"),
			skill_raw: r.skill_normalized,
			recommended_volume_min_l: Number(r.recommended_volume_min_l),
			recommended_volume_max_l: Number(r.recommended_volume_max_l),
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${r.recommended_volume_min_l}-${r.recommended_volume_max_l} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeWeightRuleHeuristic(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "heuristic_weight_rule_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("weight_rule_heuristic", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "community_heuristic"),
			skill_raw: r.skill_normalized,
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizePyzel(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "pyzel_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = lbToKg(Number(r.weight_lb));
		return {
			...baseFields("pyzel", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_source_label,
			wave_type_raw: r.wave_source_label,
			conditions_normalized: "average",
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeNsp(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "nsp_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("nsp", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeMatta(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "matta_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("matta", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeSurftech(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "surftech_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("surftech", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "table_extraction"),
			skill_raw: r.skill_source_label,
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

async function normalizeEmpire(): Promise<Observation[]> {
	const raw = fromCsv(await readFile(path.join(RAW_DIR, "surfboard_empire_raw.csv"), "utf-8"));
	return raw.map((r) => {
		const point = Number(r.recommended_volume_point_l);
		const weightKg = Number(r.weight_kg);
		return {
			...baseFields("surfboard_empire", coreProfileId(Number(r.weight_lb), r.skill_normalized), Number(r.weight_lb), r.skill_normalized as Skill, r.collected_at, "derived_from_published_formula"),
			skill_raw: r.skill_source_label,
			age: 35,
			fitness_raw: "Average",
			fitness_normalized: "average",
			recommended_volume_min_l: point,
			recommended_volume_max_l: point,
			recommended_volume_point_l: point,
			recommended_volume_display_raw: `${point} L`,
			volume_to_weight_ratio: Math.round((point / weightKg) * 1000) / 1000,
			is_directly_comparable: r.is_directly_comparable === "true",
			collection_notes: r.notes,
		} satisfies Observation;
	});
}

export async function normalize(): Promise<Observation[]> {
	const [firewire, surfSimply, roberts, pyzel, lost, rusty, js, guildFactorHeuristic, weightRuleHeuristic, nsp, matta, surftech, empire] = await Promise.all([
		normalizeFirewire(),
		normalizeSurfSimply(),
		normalizeRoberts(),
		normalizePyzel(),
		normalizeLost(),
		normalizeRusty(),
		normalizeJs(),
		normalizeGuildFactorHeuristic(),
		normalizeWeightRuleHeuristic(),
		normalizeNsp(),
		normalizeMatta(),
		normalizeSurftech(),
		normalizeEmpire(),
	]);
	const observations = [
		...firewire,
		...surfSimply,
		...roberts,
		...pyzel,
		...lost,
		...rusty,
		...js,
		...guildFactorHeuristic,
		...weightRuleHeuristic,
		...nsp,
		...matta,
		...surftech,
		...empire,
	];

	await mkdir(PROCESSED_DIR, { recursive: true });
	await writeFile(path.join(PROCESSED_DIR, "calculator_observations.json"), JSON.stringify(observations, null, 2));
	await writeFile(path.join(PROCESSED_DIR, "source_metadata.json"), JSON.stringify(SOURCE_METADATA, null, 2));

	const csvColumns: (keyof Observation)[] = [
		"observation_id",
		"source_id",
		"source_name",
		"collection_method",
		"profile_id",
		"weight_lb",
		"weight_kg",
		"skill_raw",
		"skill_normalized",
		"recommended_volume_min_l",
		"recommended_volume_max_l",
		"recommended_volume_point_l",
		"volume_to_weight_ratio",
		"is_directly_comparable",
		"is_observed",
		"is_derived",
		"collection_notes",
	];
	await writeFile(path.join(PROCESSED_DIR, "calculator_observations.csv"), toCsv(observations, csvColumns));

	console.log(`Normalized ${observations.length} observations across ${SOURCE_METADATA.length} sources.`);
	return observations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	normalize().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
