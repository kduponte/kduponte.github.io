// Method A (table_extraction) + collection-time interpolation. Surftech publishes a clean
// static table (weight in ~5kg-rounded lb steps × Beginner/Intermediate/Advanced), directly
// readable with no JS needed. Its own weight steps don't land exactly on our 7 core weights
// (they're rounded from round-number kg values: 35,40,45...110kg), so each of our 7 target
// weights is linearly interpolated between Surftech's two nearest PUBLISHED points (converted
// to kg first, since that's clearly the table's real granularity) — the same linear-interpolation
// policy used elsewhere in this project (brief §15), just applied once at collection time
// instead of deferred to query time, because our grid needs values at specific weights a
// discrete published table doesn't hit directly.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCsv } from "../lib/csv.ts";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy.ts";

const SOURCE_ID = "surftech";
const SOURCE_URL = "https://surftech.com/pages/surfboard-volume-guide";
const CORE_WEIGHTS_LB = [120, 140, 160, 180, 200, 220, 240];

// Verbatim from the page's published table, keyed by the underlying round-kg value.
const TABLE_KG: { kg: number; beginner: number; intermediate: number; advanced: number }[] = [
	{ kg: 35, beginner: 32, intermediate: 22, advanced: 18 },
	{ kg: 40, beginner: 34, intermediate: 23, advanced: 19 },
	{ kg: 45, beginner: 37, intermediate: 24, advanced: 20 },
	{ kg: 50, beginner: 39, intermediate: 25, advanced: 22 },
	{ kg: 55, beginner: 42, intermediate: 26, advanced: 23 },
	{ kg: 60, beginner: 44, intermediate: 27, advanced: 24 },
	{ kg: 65, beginner: 46, intermediate: 29, advanced: 25 },
	{ kg: 70, beginner: 50, intermediate: 31, advanced: 26 },
	{ kg: 75, beginner: 53, intermediate: 33, advanced: 27 },
	{ kg: 80, beginner: 58, intermediate: 35, advanced: 28 },
	{ kg: 85, beginner: 60, intermediate: 37, advanced: 30 },
	{ kg: 90, beginner: 64, intermediate: 43, advanced: 32 },
	{ kg: 95, beginner: 67, intermediate: 43, advanced: 33 },
	{ kg: 100, beginner: 72, intermediate: 45, advanced: 36 },
	{ kg: 105, beginner: 75, intermediate: 48, advanced: 40 },
	{ kg: 110, beginner: 80, intermediate: 50, advanced: 43 },
];

function interpolate(targetKg: number, column: "beginner" | "intermediate" | "advanced"): number {
	for (let i = 0; i < TABLE_KG.length - 1; i++) {
		const lo = TABLE_KG[i];
		const hi = TABLE_KG[i + 1];
		if (targetKg >= lo.kg && targetKg <= hi.kg) {
			const frac = (targetKg - lo.kg) / (hi.kg - lo.kg);
			return lo[column] + frac * (hi[column] - lo[column]);
		}
	}
	// Outside the published range (shouldn't happen for our 120-240 lb grid): clamp to the nearest end.
	const edge = targetKg < TABLE_KG[0].kg ? TABLE_KG[0] : TABLE_KG[TABLE_KG.length - 1];
	return edge[column];
}

const SKILL_COLUMNS: { column: "beginner" | "intermediate" | "advanced"; label: string; skill_normalized: string }[] = [
	{ column: "beginner", label: "Beginner", skill_normalized: "beginner" },
	{ column: "intermediate", label: "Intermediate", skill_normalized: "intermediate" },
	{ column: "advanced", label: "Advanced", skill_normalized: "advanced" },
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

export async function collectSurftech(): Promise<RawRow[]> {
	const rows: RawRow[] = [];
	for (const weightLb of CORE_WEIGHTS_LB) {
		const weightKg = lbToKg(weightLb);
		for (const skill of SKILL_COLUMNS) {
			const point = Math.round(interpolate(weightKg, skill.column) * 100) / 100;
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Surftech",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "table_extraction",
				weight_lb: weightLb,
				weight_kg: Math.round(weightKg * 100) / 100,
				skill_source_label: skill.label,
				skill_normalized: skill.skill_normalized,
				recommended_volume_point_l: point,
				is_directly_comparable: true,
				notes: "Linearly interpolated between Surftech's own published table points (rounded-kg weight steps) to align to our core weight grid; no extrapolation beyond the published 35-110kg range.",
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
	await writeFile(path.join(outDir, "surftech_raw.csv"), csv);
	console.log(`Surftech: wrote ${rows.length} rows to surftech_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectSurftech().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
