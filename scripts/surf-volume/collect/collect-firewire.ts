// Method A (table_extraction): Firewire publishes a static lookup table — no browser
// automation needed. We use the 3 columns that map 1:1 to our normalized skill taxonomy
// (Beginner/Intermediate/Advanced) at high confidence and skip the two hybrid columns
// (Advan/Inter, Inter/Beg) — see data/surf-volume/documentation/normalization_rules.md.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { toCsv } from "../lib/csv.ts";

const SOURCE_ID = "firewire";
const SOURCE_URL = "https://www.firewiresurfboards.com/pages/prestige-surfboard-volume-calculator";
const CORE_WEIGHTS_LB = new Set([120, 140, 160, 180, 200, 220, 240]);

const RAW_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/raw");
const CACHE_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/cache", SOURCE_ID);

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
	recommended_volume_display_raw: string;
	notes: string;
}

const SKILL_MAP: { label: string; normalized: string }[] = [
	{ label: "Beginner", normalized: "beginner" },
	{ label: "Intermediate", normalized: "intermediate" },
	{ label: "Advanced", normalized: "advanced" },
];

export async function collectFirewire(): Promise<RawRow[]> {
	const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (research; personal portfolio project; contact via site)" } });
	if (!res.ok) throw new Error(`Firewire fetch failed: ${res.status}`);
	const html = await res.text();

	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(path.join(CACHE_DIR, "page.html"), html);

	const $ = cheerio.load(html);
	const table = $("table.volume-matrix__table");
	if (table.length === 0) throw new Error("Firewire: volume-matrix__table not found — page structure may have changed.");

	const headers = table
		.find("thead th")
		.map((_, el) => $(el).text().trim())
		.get();

	const rows: RawRow[] = [];
	table.find("tbody tr").each((_, tr) => {
		const cells = $(tr)
			.find("td")
			.map((__, td) => $(td).text().trim())
			.get();
		if (cells.length === 0) return; // skip the empty "division-line" row
		const weightCell = cells[0]; // "54.55 | 120"
		const weightLb = Number(weightCell.split("|")[1]?.trim());
		if (!CORE_WEIGHTS_LB.has(weightLb)) return;

		for (const { label, normalized } of SKILL_MAP) {
			const colIndex = headers.indexOf(label);
			if (colIndex === -1) continue;
			const raw = cells[colIndex]; // headers include the leading weight column, cells[0] is weight too — aligned 1:1
			const value = Number(raw);
			rows.push({
				source_id: SOURCE_ID,
				source_name: "Firewire",
				source_url: SOURCE_URL,
				collected_at: new Date().toISOString().slice(0, 10),
				collection_method: "table_extraction",
				weight_lb: weightLb,
				weight_kg: Math.round(weightLb * 0.45359237 * 100) / 100,
				skill_source_label: label,
				skill_normalized: normalized,
				recommended_volume_point_l: value,
				recommended_volume_display_raw: raw,
				notes: "",
			});
		}
	});

	await mkdir(RAW_DIR, { recursive: true });
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
		"recommended_volume_display_raw",
		"notes",
	]);
	await writeFile(path.join(RAW_DIR, "firewire_raw.csv"), csv);
	console.log(`Firewire: wrote ${rows.length} rows to firewire_raw.csv`);
	return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	collectFirewire().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
