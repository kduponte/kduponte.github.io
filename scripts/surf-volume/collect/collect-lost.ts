// Method D (derived_from_published_formula), NOT browser automation. The brief expected Lost
// to be a rich, multi-input calculator (weight/age/fitness/frequency/skill) requiring
// Playwright. Real inspection (2026-08-05) shows otherwise: it's a canvas-drawn two-slider
// widget (weight + Guild Factor ratio) with no separate age/fitness/frequency inputs — those
// are folded qualitatively into which GF band the visitor picks. The page explicitly credits
// "all rights reserved©, Whitney Guild 2013" — the same Guild Factor origin as Roberts
// Surfboards. This is a genuine, documented methodology overlap (methodology_family =
// "guild_factor"), not a coincidence — see data/surf-volume/documentation/source_notes.md.
//
// Published bands (from the page text):
//   Advanced, extremely fit, high performance:            .34-.36 GF
//   Typical fitness, average-to-above-average skills:      .36-.38 GF  (skipped: no clean 3-tier match)
//   Domesticated, lower fitness, desk jobs, weekend warrior: .38-.42 GF
//   Novice / extremely small surf / thick wetsuits:         .40-.50 GF
// GF = liters / weight_kg (same unit resolution as Roberts, same underlying methodology).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "lost";
const SOURCE_URL = "https://lostsurfboards.net/volume-calculator/";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];

const SKILL_MAP: { sourceLabel: string; skill_normalized: string; gfMin: number; gfMax: number }[] = [
	{ sourceLabel: "Novice / adverse conditions", skill_normalized: "beginner", gfMin: 0.4, gfMax: 0.5 },
	{ sourceLabel: "Domesticated, lower fitness, weekend warrior", skill_normalized: "intermediate", gfMin: 0.38, gfMax: 0.42 },
	{ sourceLabel: "Advanced, extremely fit, high performance", skill_normalized: "advanced", gfMin: 0.34, gfMax: 0.36 },
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
	recommended_volume_min_l: number;
	recommended_volume_max_l: number;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectLost(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = Math.round(weightLb * 0.45359237 * 100) / 100;
		for (const s of SKILL_MAP) {
			const minL = Math.round(weightKg * s.gfMin * 100) / 100;
			const maxL = Math.round(weightKg * s.gfMax * 100) / 100;
			const pointL = Math.round(((minL + maxL) / 2) * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Lost Surfboards",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_formula",
				weight_lb: weightLb,
				weight_kg: weightKg,
				skill_source_label: s.sourceLabel,
				skill_normalized: s.skill_normalized,
				recommended_volume_min_l: minL,
				recommended_volume_max_l: maxL,
				recommended_volume_point_l: pointL,
				is_directly_comparable: true,
				notes: `GF band ${s.gfMin}-${s.gfMax}; methodology_family=guild_factor, shares "Whitney Guild 2013" origin with Roberts Surfboards — see methodology_families.`,
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
		"recommended_volume_min_l",
		"recommended_volume_max_l",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "lost_raw.csv"), csv);
	console.log(`Lost: wrote ${rows.length} rows to lost_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectLost().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
