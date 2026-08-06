// Method D (derived_from_published_formula). NSP's calculator is a WordPress inline <script>
// (not minified) — read directly rather than automated, and NOT live-verified via their
// "Calculate" button, because that button also fires a first-party analytics POST (geolocation
// + inputs) to a Google Apps Script logging endpoint. Reading the unminified source and
// reproducing the formula ourselves avoids generating that log entry entirely, consistent with
// brief §20 ("avoid unnecessary repeated requests," "never submit personal information").
//
// Genuinely distinct from every other source in this project: NSP's formula takes BOARD TYPE
// as an input (shortboard/fish/midlength/longboard), not just weight and skill. We hold board
// type at "shortboard" (multiplier 1.0) to stay comparable with every other source's implicit
// "regular shortboard" framing (matches Pyzel's explicit "basic performance board" assumption).
//
// Verified 2026-08-06: volume_L = weight_kg * abilityFactor * boardMultiplier. Height is
// collected on the form but not used in the formula — same pattern as JS Industries.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy.ts";

const SOURCE_ID = "nsp";
const SOURCE_URL = "https://www.nspsurfboards.com/nsp-surfboard-volume-calculator/";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];

// Verbatim from the page's own inline script.
const ABILITY_FACTORS = { casual: 0.52, intermediate: 0.45, experienced: 0.38, pro: 0.36 } as const;
const BOARD_MULTIPLIER_SHORTBOARD = 1.0;

const SKILL_MAP: { nspValue: keyof typeof ABILITY_FACTORS; skill_normalized: string; label: string }[] = [
	{ nspValue: "casual", skill_normalized: "beginner", label: "Beginner" },
	{ nspValue: "intermediate", skill_normalized: "intermediate", label: "Intermediate" },
	{ nspValue: "experienced", skill_normalized: "advanced", label: "Experienced" },
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

export async function collectNsp(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = lbToKg(weightLb);
		for (const skill of SKILL_MAP) {
			const point = Math.round(weightKg * ABILITY_FACTORS[skill.nspValue] * BOARD_MULTIPLIER_SHORTBOARD * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "NSP",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_formula",
				weight_lb: weightLb,
				weight_kg: Math.round(weightKg * 100) / 100,
				skill_source_label: skill.label,
				skill_normalized: skill.skill_normalized,
				recommended_volume_point_l: point,
				is_directly_comparable: true,
				notes: "Board type held at 'shortboard' (multiplier 1.0) to match other sources' implicit assumption; formula transcribed verbatim from unminified inline JS, not live-verified to avoid triggering the page's analytics logging endpoint.",
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
	await writeFile(path.join(outDir, "nsp_raw.csv"), csv);
	console.log(`NSP: wrote ${rows.length} rows to nsp_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectNsp().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
