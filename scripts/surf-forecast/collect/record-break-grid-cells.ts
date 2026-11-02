// Records which grid cell each forecasting system actually answered from at every break's offshore
// sample point, and how far that cell is from the break.
//
// Needed because the point-selection check turned out weaker than intended: every break passed at
// the first candidate, 5 km out, because these three models snap a request to their nearest sea
// cell instead of answering a land point with zeros. "Returns real values" therefore says little
// on its own. What matters is where the answer came from, so it is measured per model, the same
// way grid snapping was measured at the buoys.
//
// Run: npx tsx scripts/surf-forecast/collect/record-break-grid-cells.ts
import { readFileSync, writeFileSync } from "node:fs";
import { SURF_BREAKS } from "../../../src/lib/surf-forecast/spots";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const PATH = "data/surf-forecast/break-points.json";
const MODELS = ["ecmwf_wam", "ncep_gfswave016", "gwam"];
const GAP_MS = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLon - aLon) / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function cellFor(lat: number, lon: number, model: string): Promise<{ latitude: number; longitude: number } | null> {
	const qs = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		hourly: "wave_height",
		models: model,
		start_date: "2026-06-01",
		end_date: "2026-06-01",
		timezone: "UTC",
	});
	for (let attempt = 1; attempt <= 4; attempt++) {
		const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${qs}`, { headers: { "User-Agent": UA } });
		if (res.status === 429 || res.status >= 500) {
			await sleep(GAP_MS * 2 ** attempt);
			continue;
		}
		if (!res.ok) return null;
		const body = (await res.json()) as { latitude: number; longitude: number };
		return { latitude: body.latitude, longitude: body.longitude };
	}
	return null;
}

async function main(): Promise<void> {
	const doc = JSON.parse(readFileSync(PATH, "utf8"));
	for (const entry of doc.breaks) {
		if (!entry.point) continue;
		const brk = SURF_BREAKS.find((b) => b.id === entry.id);
		if (!brk) throw new Error(`unknown break ${entry.id}`);
		const cells: Record<string, unknown> = {};
		const parts: string[] = [];
		for (const m of MODELS) {
			const c = await cellFor(entry.point.latitude, entry.point.longitude, m);
			await sleep(GAP_MS);
			if (!c) {
				cells[m] = null;
				parts.push(`${m} ?`);
				continue;
			}
			const fromBreak = haversineKm(brk.latitude, brk.longitude, c.latitude, c.longitude);
			cells[m] = { ...c, km_from_break: Number(fromBreak.toFixed(1)) };
			parts.push(`${m.replace("ncep_gfswave016", "noaa").replace("ecmwf_wam", "ecmwf")} ${fromBreak.toFixed(1).padStart(5)}`);
		}
		entry.grid_cells = cells;
		console.log(`${entry.name.padEnd(26)} ${parts.join("   ")}`);
	}
	writeFileSync(PATH, `${JSON.stringify(doc, null, "\t")}\n`);
	console.log(`\nUpdated ${PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Grid cell recording failed:", err);
		process.exit(1);
	});
}
