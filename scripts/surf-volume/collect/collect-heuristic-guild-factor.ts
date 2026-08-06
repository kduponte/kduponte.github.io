// community_heuristic, method derived_from_published_ratio. Citation reviewed and approved
// with Kyle before publishing (2026-08-05) — see data/surf-volume/documentation/heuristic_sources.md.
//
// Provenance: "Guild Factor" (GF = liters / weight_kg) is credited to former pro surfer
// Whitney Guild, who polled pro surfers' weight/volume at a 2016 WSL Trestles event and found
// GF 0.34-0.36 for pro-level riders. Corroborated independently by Lost Surfboards' own blog
// post ("What's Your Guild Factor?"), Vader Surfboards, and SurferToday coverage — plus our
// own real collected data from Roberts and Lost, both of which implement brand-specific tuned
// versions of the same system. This heuristic entry uses the GENERIC community-cited bands
// (not either brand's specific tuned constants), deliberately kept distinct from `roberts` and
// `lost` even though all three share methodology_family = "guild_factor".
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "guild_factor_heuristic";
const SOURCE_URL = "https://lostsurfboards.net/whats-your-guild-factor-surfboard-volumes-explained/";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];

// Midpoints of the generic community-cited bands (brief §5 requires provenance, not a range
// point estimate, so we use the band midpoint as recommended_volume_point_l).
const SKILL_MAP: { skill_normalized: string; gfMin: number; gfMax: number }[] = [
	{ skill_normalized: "beginner", gfMin: 0.5, gfMax: 0.6 },
	{ skill_normalized: "intermediate", gfMin: 0.36, gfMax: 0.38 },
	{ skill_normalized: "advanced", gfMin: 0.34, gfMax: 0.36 },
];

interface RawRow {
	source_id: string;
	source_name: string;
	source_url: string;
	collected_at: string;
	collection_method: string;
	weight_lb: number;
	weight_kg: number;
	skill_normalized: string;
	recommended_volume_min_l: number;
	recommended_volume_max_l: number;
	recommended_volume_point_l: number;
	is_directly_comparable: boolean;
	notes: string;
}

export async function collectGuildFactorHeuristic(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = Math.round(weightLb * 0.45359237 * 100) / 100;
		for (const s of SKILL_MAP) {
			const minL = Math.round(weightKg * s.gfMin * 100) / 100;
			const maxL = Math.round(weightKg * s.gfMax * 100) / 100;
			const pointL = Math.round(((minL + maxL) / 2) * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Guild Factor heuristic",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "derived_from_published_ratio",
				weight_lb: weightLb,
				weight_kg: weightKg,
				skill_normalized: s.skill_normalized,
				recommended_volume_min_l: minL,
				recommended_volume_max_l: maxL,
				recommended_volume_point_l: pointL,
				is_directly_comparable: true,
				notes: `Generic GF band ${s.gfMin}-${s.gfMax}, provenance: Whitney Guild, 2016 WSL Trestles pro-surfer poll. methodology_family=guild_factor — shares foundation with Roberts and Lost.`,
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
		"recommended_volume_min_l",
		"recommended_volume_max_l",
		"recommended_volume_point_l",
		"is_directly_comparable",
		"notes",
	]);
	await writeFile(path.join(outDir, "heuristic_guild_factor_raw.csv"), csv);
	console.log(`Guild Factor heuristic: wrote ${rows.length} rows to heuristic_guild_factor_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectGuildFactorHeuristic().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
