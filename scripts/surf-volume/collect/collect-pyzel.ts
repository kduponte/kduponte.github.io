// Method D (derived_from_published_formula): Pyzel's volume guide page embeds a small
// interactive widget (an iframe at pyzel-volume-calculator.netlify.app, not a static table).
// Its exact formula and lookup data are shipped in plain, publicly-served client-side
// JavaScript (main.b42442d3.chunk.js) — inspected directly rather than guessed or scraped
// through automation. Verified 2026-08-05:
//
//   u = [{pounds, kilogram, pro}, ...]   // a "Pro" ability baseline per weight, 28 points
//   y = 50 (Beginner) | 25 (Intermediate) | 5 (Advanced) | 0 (Pro)
//   N = 1.5 (Weak waves) | 0.7 (Average waves) | 0 (Good waves)
//   volume_l = pro_baseline * (1 + y/100) + N
//
// All 7 of our core weights (120-240 lb) are exact points in Pyzel's own table — no
// interpolation needed. Wave quality is held at "Average" (N=0.7) to match our Dataset A
// reference profile's `conditions: average`.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "pyzel";
const SOURCE_URL = "https://pyzelsurfboards.com/pages/volume-calculator";
const WAVE_QUALITY_N = 0.7; // "Average" waves — matches our Dataset A reference conditions

// Verbatim from Pyzel's own shipped JS (u[] array), filtered to our 7 core weights.
const PRO_BASELINE_BY_WEIGHT_LB: Record<number, number> = {
	120: 20.7,
	140: 22.2,
	160: 25.4,
	180: 28.6,
	200: 31.8,
	220: 36,
	240: 41.4,
};

const ABILITY_MAP: { sourceLabel: string; skill_normalized: string; y: number }[] = [
	{ sourceLabel: "Beginner", skill_normalized: "beginner", y: 50 },
	{ sourceLabel: "Intermediate", skill_normalized: "intermediate", y: 25 },
	{ sourceLabel: "Advanced", skill_normalized: "advanced", y: 5 },
];

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	weight_lb: number;
	skill_source_label: string;
	skill_normalized: string;
	wave_source_label: string;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectPyzel(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const [weightLbStr, proBaseline] of Object.entries(PRO_BASELINE_BY_WEIGHT_LB)) {
		const weightLb = Number(weightLbStr);
		for (const ability of ABILITY_MAP) {
			const pointL = Math.round((proBaseline * (1 + ability.y / 100) + WAVE_QUALITY_N) * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Pyzel",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_formula",
				weight_lb: weightLb,
				skill_source_label: ability.sourceLabel,
				skill_normalized: ability.skill_normalized,
				wave_source_label: "Average",
				recommended_volume_point_l: pointL,
				is_directly_comparable: true,
				notes: "Formula extracted from the publicly-served JS of Pyzel's embedded calculator widget (not guessed); wave quality held at 'Average' to match our reference profile.",
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
		"skill_source_label",
		"skill_normalized",
		"wave_source_label",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "pyzel_raw.csv"), csv);
	console.log(`Pyzel: wrote ${rows.length} rows to pyzel_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectPyzel().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
