// community_heuristic, method community_heuristic (not derived_from_published_formula — no
// single citable formula exists). Citation reviewed and approved with Kyle before publishing
// (2026-08-05), explicitly on the condition it's labeled as uncredited folk knowledge — see
// data/surf-volume/documentation/heuristic_sources.md.
//
// Provenance: NO single identifiable originator found. Multiple secondary surf-content sites
// (SurferToday, Global Surf Industries, assorted surf-coaching blogs) independently converge
// on similar weight_kg-to-volume_L coefficients, but none credits a specific person or study
// the way Guild Factor traces to Whitney Guild. Values are plausible and roughly consistent
// with this project's own real collected data, but this is diffuse, widely-repeated folk
// knowledge — not a formal, attributable model. Presented as exactly that.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "weight_rule_heuristic";
const SOURCE_URL = "https://www.surfertoday.com/surfing/the-surfboard-volume-calculator";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];

// Midpoints of the commonly-cited coefficient ranges (~0.6-0.7 / ~0.47 / ~0.35-0.39 L per kg).
const SKILL_COEFFICIENT: Record<string, number> = {
	beginner: 0.65,
	intermediate: 0.47,
	advanced: 0.37,
};

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	weight_lb: number;
	weight_kg: number;
	skill_normalized: string;
	coefficient_l_per_kg: number;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectWeightRuleHeuristic(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = Math.round(weightLb * 0.45359237 * 100) / 100;
		for (const [skill_normalized, coefficient] of Object.entries(SKILL_COEFFICIENT)) {
			const pointL = Math.round(weightKg * coefficient * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Weight-based rule of thumb",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "community_heuristic",
				weight_lb: weightLb,
				weight_kg: weightKg,
				skill_normalized,
				coefficient_l_per_kg: coefficient,
				recommended_volume_point_l: pointL,
				is_directly_comparable: true,
				notes: "No single identifiable originator — a widely-repeated coefficient across secondary surf-content sources, presented as uncredited folk knowledge, not a formal published model.",
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
		"skill_normalized",
		"coefficient_l_per_kg",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "heuristic_weight_rule_raw.csv"), csv);
	console.log(`Weight-rule heuristic: wrote ${rows.length} rows to heuristic_weight_rule_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectWeightRuleHeuristic().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
