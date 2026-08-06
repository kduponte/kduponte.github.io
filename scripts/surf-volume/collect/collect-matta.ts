// Method D (derived_from_published_formula). Matta's calculator is inline, unminified jQuery
// on the page itself — read directly. Genuinely distinct mathematical structure from every
// other source here: an ADDITIVE flat-liter offset by skill, not a multiplicative ratio.
// Verified 2026-08-06: base_L = weight_kg * 0.4 (confirmed exactly across the full published
// kgs_lts lookup table, e.g. 20kg->8L, 100kg->40L — a clean linear rule, not just a coincidence
// at one point). volume_L = base_L + level_add, level_add: Beginner +10, Intermediate +0,
// Advanced -6. The resulting number is what the page uses internally to filter board-model
// suggestions, but it's a genuine liters figure before that filtering happens.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy.ts";

const SOURCE_ID = "matta";
const SOURCE_URL = "https://www.matta.surf/volume-calculator/";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];
const BASE_L_PER_KG = 0.4;

const SKILL_MAP: { skill_normalized: string; label: string; levelAddL: number }[] = [
	{ skill_normalized: "beginner", label: "Begginer", levelAddL: 10 }, // sic — verbatim typo on the page's own <option>
	{ skill_normalized: "intermediate", label: "Intermediate", levelAddL: 0 },
	{ skill_normalized: "advanced", label: "Advanced", levelAddL: -6 },
];

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	weight_lb: number;
	weight_kg: number;
	skill_source_label: string;
	skill_normalized: string;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectMatta(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = lbToKg(weightLb);
		const baseL = weightKg * BASE_L_PER_KG;
		for (const skill of SKILL_MAP) {
			const point = Math.round((baseL + skill.levelAddL) * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Matta Surfboards",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_formula",
				weight_lb: weightLb,
				weight_kg: Math.round(weightKg * 100) / 100,
				skill_source_label: skill.label,
				skill_normalized: skill.skill_normalized,
				recommended_volume_point_l: point,
				is_directly_comparable: true,
				notes: "Additive skill offset (not a ratio): base = weight_kg * 0.4, then +10/+0/-6 L by skill. Formula transcribed verbatim from unminified inline JS.",
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
		"skill_source_label",
		"skill_normalized",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "matta_raw.csv"), csv);
	console.log(`Matta: wrote ${rows.length} rows to matta_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectMatta().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
