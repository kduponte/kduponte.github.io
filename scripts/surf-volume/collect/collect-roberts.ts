// Method D (derived_from_published_formula): Roberts Surfboards publishes an interactive
// slider tool (Guild Factor: GF = liters / bodyweight) rather than a static table, but their
// own page explicitly states the exact GF constants used on their model pages for each of our
// 3 skill tiers: "For the Advanced column we used a GF of .36, for Intermediate we used .42
// and for Novice we used .50." That's a directly reusable published formula.
//
// Unit note: the page's prose says "GF = Liters/LB or Liters/KG" (self-contradictory). We
// resolve this as liters/KG, because volume_l = weight_kg * GF reproduces values within a few
// liters of Firewire's independently-collected real table (e.g. 180 lb: Roberts intermediate
// GF .42 -> 34.3 L vs. Firewire's real intermediate 180 lb -> 35.80 L), whereas liters/LB
// would imply implausibly large boards (e.g. ~76 L for the same profile). Confidence: medium.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "roberts";
const SOURCE_URL = "https://www.robertssurf.com/volume-finder.html";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];
const RANGE_HALF_WIDTH_L = 0.5; // page: "Ideal Volume has a range of +/- 0.5 Liters"

const SKILL_MAP: { sourceLabel: string; skill_normalized: string; guildFactor: number; confidence: string }[] = [
	{ sourceLabel: "Novice Surfer Learning the Lineup", skill_normalized: "beginner", guildFactor: 0.5, confidence: "high" },
	{ sourceLabel: "Intermediate and Older Experienced Surfers", skill_normalized: "intermediate", guildFactor: 0.42, confidence: "high" },
	{ sourceLabel: "Normal Fitness Advanced Riders", skill_normalized: "advanced", guildFactor: 0.36, confidence: "high" },
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
	guild_factor: number;
	recommended_volume_min_l: number;
	recommended_volume_max_l: number;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectRoberts(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = Math.round(weightLb * 0.45359237 * 100) / 100;
		for (const s of SKILL_MAP) {
			const pointL = Math.round(weightKg * s.guildFactor * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Roberts Surfboards",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_formula",
				weight_lb: weightLb,
				weight_kg: weightKg,
				skill_source_label: s.sourceLabel,
				skill_normalized: s.skill_normalized,
				guild_factor: s.guildFactor,
				recommended_volume_min_l: Math.round((pointL - RANGE_HALF_WIDTH_L) * 100) / 100,
				recommended_volume_max_l: Math.round((pointL + RANGE_HALF_WIDTH_L) * 100) / 100,
				recommended_volume_point_l: pointL,
				is_directly_comparable: true,
				notes: `Guild Factor ${s.guildFactor} (skill-label confidence: ${s.confidence}); methodology_family=guild_factor — shares foundation with Lost and the Guild Factor heuristic, see methodology_families.`,
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
		"guild_factor",
		"recommended_volume_min_l",
		"recommended_volume_max_l",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "roberts_raw.csv"), csv);
	console.log(`Roberts: wrote ${rows.length} rows to roberts_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectRoberts().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
