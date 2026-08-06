// Method D (derived_from_published_ratio): Surf Simply publishes a volume-to-weight RATIO
// framework (not a point-estimate calculator) at surfsimply.com/volume-to-weight-calculator.
// It explicitly describes itself as "the smallest board that is practical," a functional
// floor per skill level — not a comfortable point recommendation like the other sources.
// Per brief §12 comparability rules ("the system represents a reference philosophy rather
// than a comparable point estimate"), these observations are marked is_directly_comparable
// = false: they're shown for reference/context but excluded from the median consensus.
//
// The site renders these bands as an interactive hover chart (not a static data table), so
// the published percentage bands are transcribed here directly from the page's own labeled
// legend (verified 2026-08-05) rather than scraped — this is a legitimate "derived from
// published ratio" collection, not a guess.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "surf_simply";
const SOURCE_URL = "https://surfsimply.com/volume-to-weight-calculator";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];

// Published bands (volume/weight ratio, i.e. volume_l = weight_kg * ratio), transcribed from
// the site's own legend. We use the MIDPOINT of each band as a point estimate.
// Surf Simply's own scale is Level 1-4 (plus a "Level 3.5" half-step and "Pro"), not our
// 3-tier taxonomy — see data/surf-volume/documentation/normalization_rules.md for the mapping
// rationale/confidence recorded per level.
const LEVEL_TO_SKILL: { sourceLevel: string; skill_normalized: string; bandMin: number; bandMax: number; confidence: string }[] = [
	{ sourceLevel: "Level 1", skill_normalized: "beginner", bandMin: 1.0, bandMax: 1.5, confidence: "high" },
	{ sourceLevel: "Level 2", skill_normalized: "intermediate", bandMin: 0.8, bandMax: 1.0, confidence: "medium" },
	{ sourceLevel: "Level 4", skill_normalized: "advanced", bandMin: 0.4, bandMax: 0.5, confidence: "high" },
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
	comparison_exclusion_reason: string;
	notes: string;
}

export async function collectSurfSimply(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = Math.round(weightLb * 0.45359237 * 100) / 100;
		for (const level of LEVEL_TO_SKILL) {
			const minL = Math.round(weightKg * level.bandMin * 100) / 100;
			const maxL = Math.round(weightKg * level.bandMax * 100) / 100;
			const pointL = Math.round(((minL + maxL) / 2) * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Surf Simply",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_ratio",
				weight_lb: weightLb,
				weight_kg: weightKg,
				skill_source_label: level.sourceLevel,
				skill_normalized: level.skill_normalized,
				recommended_volume_min_l: minL,
				recommended_volume_max_l: maxL,
				recommended_volume_point_l: pointL,
				is_directly_comparable: false,
				comparison_exclusion_reason: "Reference philosophy (minimum functional volume-to-weight ratio), not a comfortable point recommendation — brief §12.",
				notes: `Band: ${(level.bandMin * 100).toFixed(0)}%-${(level.bandMax * 100).toFixed(0)}% of body weight, skill confidence: ${level.confidence}`,
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
		"comparison_exclusion_reason",
		"notes",
	]);
	await writeFile(path.join(outDir, "surf_simply_raw.csv"), csv);
	console.log(`Surf Simply: wrote ${rows.length} rows to surf_simply_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectSurfSimply().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
