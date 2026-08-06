// Method D (derived_from_published_formula), not browser automation — despite the brief
// predicting "high model complexity, lower transparency" and expecting Playwright. Real
// inspection (2026-08-05) found the opposite: JS Industries' 10-input calculator computes
// entirely client-side (no server round-trip for the volume itself — `suggestBoards()`
// separately hits Shopify's own product API just to recommend stock boards) via a fully
// commented "HYBRID FORMULA" function, more transparent in practice than several sources
// here that only publish a black-box table.
//
// Constants transcribed verbatim from the page's own VOLUME_FACTORS / CONVERSION_FACTORS
// objects. Because the formula is continuous (not a lookup table), it can be evaluated for
// every Dataset A/B profile at zero collection cost — no automation needed even for the
// one-factor-at-a-time sensitivity variants, unlike Rusty.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";
import { generateDatasetA, generateDatasetBArchetypes, generateDatasetBSensitivityVariants } from "../../../src/lib/surf-volume/profiles.ts";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy.ts";
import type { SampleProfile } from "../../../src/lib/surf-volume/types.ts";

const SOURCE_ID = "js_industries";
const SOURCE_URL = "https://jsindustries.com/pages/volume-calculator";

const VOLUME_FACTORS = {
	weightMultiplier: 0.4,
	ageFactor: { under20: 0.995, under30: 0.945, under40: 0.96, under50: 0.965, over50: 0.99 },
	genderFactor: { male: 1.0, female: 1.02, other: 1.001 },
	fitnessFactor: { beginner: 1.07, intermediate: 1.045, advanced: 1.025 }, // labels: Unfit / Reasonably fit / Very fit
	frequencyFactor: { never: 1.15, rarely: 0.95, sometimes: 0.92, regularly: 0.91, often: 0.9 },
	skillFactor: { beginner: 1.1, novice: 1, intermediate: 0.865, advanced: 0.85, expert: 0.84 },
	wetsuitFactor: { none: 1, springsuit: 1.01, threetwo: 1.03, fourthree: 1.04 },
	waveTypeFactor: { fat: 1.1, steep: 1.075, reef: 1.075 },
	waveSizeFactor: { small: 1.125, medium: 1.1, large: 1.125, xl: 1.15, xxl: 1.175 },
} as const;

type SkillKey = keyof typeof VOLUME_FACTORS.skillFactor;
const SKILL_TO_JS: Record<string, SkillKey> = { beginner: "beginner", intermediate: "intermediate", advanced: "advanced" };

// Our 3-tier fitness (low/average/high) mapped to JS's fitness labels (Unfit/Reasonably fit/Very fit).
const FITNESS_TO_JS: Record<string, keyof typeof VOLUME_FACTORS.fitnessFactor> = { low: "beginner", average: "intermediate", high: "advanced" };
// Our 3-tier frequency mapped to JS's 5-tier scale. "sometimes" (a few times a month) is the
// closest single match for "occasional" (brief taxonomy spans "a few times a year or monthly
// or less") — medium confidence, see normalization_rules.md.
const FREQUENCY_TO_JS: Record<string, keyof typeof VOLUME_FACTORS.frequencyFactor> = { occasional: "sometimes", weekly: "regularly", frequent: "often" };
// Our single "conditions" taxonomy mapped onto JS's two separate wave dimensions.
const CONDITIONS_TO_JS: Record<string, { waveType: keyof typeof VOLUME_FACTORS.waveTypeFactor; waveSize: keyof typeof VOLUME_FACTORS.waveSizeFactor }> = {
	weak_or_small: { waveType: "fat", waveSize: "small" },
	average: { waveType: "steep", waveSize: "medium" },
	powerful_or_large: { waveType: "reef", waveSize: "large" },
};
const WETSUIT_TO_JS: Record<string, keyof typeof VOLUME_FACTORS.wetsuitFactor> = { none_or_light: "springsuit", standard: "threetwo", heavy: "fourthree" };

function ageBracket(age: number): keyof typeof VOLUME_FACTORS.ageFactor {
	if (age < 20) return "under20";
	if (age < 30) return "under30";
	if (age < 40) return "under40";
	if (age < 50) return "under50";
	return "over50";
}

function calculateVolume(profile: SampleProfile): number {
	const weightKg = lbToKg(profile.weight_lb);
	const skill = SKILL_TO_JS[profile.skill];
	const fitness = FITNESS_TO_JS[profile.fitness ?? "average"];
	const frequency = FREQUENCY_TO_JS[profile.frequency ?? "occasional"];
	const wetsuit = WETSUIT_TO_JS[profile.wetsuit ?? "standard"];
	const { waveType, waveSize } = CONDITIONS_TO_JS[profile.conditions ?? "average"];

	let bodyBase = weightKg * VOLUME_FACTORS.weightMultiplier;
	bodyBase *= VOLUME_FACTORS.ageFactor[ageBracket(profile.age ?? 35)];
	bodyBase *= VOLUME_FACTORS.genderFactor.male; // brief §11: "gender: male only where mandatory"

	const REF_BASE = 70 * VOLUME_FACTORS.weightMultiplier; // 28L reference, per the page's own comment
	const behavioralAdd =
		(VOLUME_FACTORS.fitnessFactor[fitness] - 1) * REF_BASE +
		(VOLUME_FACTORS.frequencyFactor[frequency] - 1) * REF_BASE +
		(VOLUME_FACTORS.skillFactor[skill] - 1) * REF_BASE +
		(VOLUME_FACTORS.wetsuitFactor[wetsuit] - 1) * REF_BASE +
		(VOLUME_FACTORS.waveTypeFactor[waveType] - 1) * REF_BASE +
		(VOLUME_FACTORS.waveSizeFactor[waveSize] - 1) * REF_BASE;

	return bodyBase + behavioralAdd;
}

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	profile_id: string;
	weight_lb: number;
	weight_kg: number;
	skill_normalized: string;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectJs(): Promise<RawRow[]> {
	const profiles: SampleProfile[] = [...generateDatasetA(), ...generateDatasetBArchetypes(), ...generateDatasetBSensitivityVariants()];
	const collectedAt = new Date().toISOString().slice(0, 10);

	const rows: RawRow[] = profiles.map((profile) => {
		const point = Math.round(calculateVolume(profile) * 100) / 100;
		return {
			source_id: SOURCE_ID,
			source_name: "JS Industries",
			source_url: SOURCE_URL,
			collected_at: collectedAt,
			collection_method: "derived_from_published_formula",
			profile_id: profile.profile_id,
			weight_lb: profile.weight_lb,
			weight_kg: Math.round(lbToKg(profile.weight_lb) * 100) / 100,
			skill_normalized: profile.skill,
			recommended_volume_point_l: point,
			is_directly_comparable: true,
			notes: "Formula transcribed verbatim from the page's own commented client-side JS (VOLUME_FACTORS).",
		};
	});

	const outDir = path.resolve(import.meta.dirname, "../../../data/surf-volume/raw");
	await mkdir(outDir, { recursive: true });
	const csv = toCsv(rows, [
		"source_id",
		"source_name",
		"source_url",
		"collected_at",
		"collection_method",
		"profile_id",
		"weight_lb",
		"weight_kg",
		"skill_normalized",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "js_raw.csv"), csv);
	console.log(`JS Industries: wrote ${rows.length} rows to js_raw.csv (${profiles.length} profiles: Dataset A + B archetypes + B variants)`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectJs().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
