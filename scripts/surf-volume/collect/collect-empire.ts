// Method D (derived_from_published_formula). Surfboard Empire ships a dedicated, unminified
// first-party script (`volume-calculator.js`, not a third-party embed) containing a complete
// weight×skill lookup table plus age and fitness multipliers. Read directly.
// Verified 2026-08-06: final_L = calcs[weight_kg][skillIndex] * ageFactor * fitnessFactor * 0.75
// (calc_offset). skillIndex: Beginner=4, Intermediate=3, Intermediate/Advanced=2, Advance=1,
// Advance+=0 (i.e. the table itself already varies by both weight AND skill, unlike sources
// where skill only appears as a multiplier). Gender is collected on the form but never
// referenced in the formula — the same "collected but unused" pattern seen in JS Industries
// and NSP. Weight keys are integer kg; each of our 7 core weights is rounded to the nearest
// published integer-kg key (max rounding error ~0.5kg).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy.ts";

const SOURCE_ID = "surfboard_empire";
const SOURCE_URL = "https://surfboardempire.com.au/pages/volume-calculator";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];
const CALC_OFFSET = 0.75;
const AGE_35_FACTOR = 1.08; // bracket 31-50
const FITNESS_AVERAGE_FACTOR = 1.1;

// [Advance+, Advance, Intermediate/Advanced, Intermediate, Beginner] per the page's own array
// order, keyed by nearest published integer-kg weight to each of our 7 core weights.
const TABLE: Record<number, [number, number, number, number, number]> = {
	54: [19.8, 21.45, 23.65, 30.25, 37.95],
	64: [22.75, 24.7, 27.3, 35.1, 44.2],
	73: [26.25, 28.5, 31.5, 40.5, 51],
	82: [29.75, 32.3, 35.7, 45.9, 57.8],
	91: [31.5, 34.2, 37.8, 48.6, 61.2],
	100: [35, 38, 42, 54, 68],
	109: [36.75, 39.9, 44.1, 56.7, 71.4],
};

const WEIGHT_TO_TABLE_KG: Record<number, number> = { 120: 54, 140: 64, 160: 73, 180: 82, 200: 91, 220: 100, 240: 109 };

const SKILL_MAP: { index: 4 | 3 | 1; label: string; skill_normalized: string }[] = [
	{ index: 4, label: "Beginner", skill_normalized: "beginner" },
	{ index: 3, label: "Intermediate", skill_normalized: "intermediate" },
	{ index: 1, label: "Advance", skill_normalized: "advanced" },
];

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	weight_lb: number;
	weight_kg: number;
	table_weight_kg: number;
	skill_source_label: string;
	skill_normalized: string;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectEmpire(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const tableKg = WEIGHT_TO_TABLE_KG[weightLb];
		const baseRow = TABLE[tableKg];
		for (const skill of SKILL_MAP) {
			const base = baseRow[skill.index];
			const point = Math.round(base * AGE_35_FACTOR * FITNESS_AVERAGE_FACTOR * CALC_OFFSET * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Surfboard Empire",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_formula",
				weight_lb: weightLb,
				weight_kg: Math.round(lbToKg(weightLb) * 100) / 100,
				table_weight_kg: tableKg,
				skill_source_label: skill.label,
				skill_normalized: skill.skill_normalized,
				recommended_volume_point_l: point,
				is_directly_comparable: true,
				notes: `Rounded to nearest published table weight (${tableKg}kg); "Performance" volume figure, age=35 (bracket factor ${AGE_35_FACTOR}), fitness=Average (factor ${FITNESS_AVERAGE_FACTOR}).`,
			});
		}
	}

	const outDir = path.resolve(import.meta.dirname, "../../../data/surf-volume/raw");
	await mkdir(outDir, { recursive: true });
	const csv = toCsv(rows, [
		"source_id",
		"source_name",
		"source_url",
		"collected_at",
		"collection_method",
		"weight_lb",
		"weight_kg",
		"table_weight_kg",
		"skill_source_label",
		"skill_normalized",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "surfboard_empire_raw.csv"), csv);
	console.log(`Surfboard Empire: wrote ${rows.length} rows to surfboard_empire_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectEmpire().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
