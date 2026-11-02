// Forecasts at each break's offshore sample point, for the disagreement analysis.
//
// No buoy is involved, so this needs only the three representative systems, wave height, and the
// leads the page reports. One request per break covers the whole window; each response is cached
// verbatim and skipped on re-run.
//
// Run: npx tsx scripts/surf-forecast/collect/collect-break-forecasts.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { WINDOW_END, WINDOW_START } from "./window";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const POINTS = "data/surf-forecast/break-points.json";
const CACHE_DIR = "data/surf-forecast/cache/open-meteo-breaks";
export const BREAK_MODELS = ["ecmwf_wam", "ncep_gfswave016", "gwam"];
export const BREAK_LEADS = [0, 1, 3, 5];
const GAP_MS = 6000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
	mkdirSync(CACHE_DIR, { recursive: true });
	const doc = JSON.parse(readFileSync(POINTS, "utf8")) as { breaks: { id: string; point: { latitude: number; longitude: number } | null }[] };
	const hourly = BREAK_LEADS.map((d) => (d === 0 ? "wave_height" : `wave_height_previous_day${d}`)).join(",");
	let fetched = 0;
	let skipped = 0;
	const failures: string[] = [];

	for (const b of doc.breaks) {
		const path = `${CACHE_DIR}/${b.id}.json`;
		if (!b.point) continue;
		if (existsSync(path)) {
			skipped++;
			continue;
		}
		const qs = new URLSearchParams({
			latitude: String(b.point.latitude),
			longitude: String(b.point.longitude),
			hourly,
			models: BREAK_MODELS.join(","),
			start_date: WINDOW_START,
			end_date: WINDOW_END,
			timezone: "UTC",
			timeformat: "iso8601",
		});
		const url = `https://marine-api.open-meteo.com/v1/marine?${qs}`;
		let ok = false;
		for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
			try {
				const res = await fetch(url, { headers: { "User-Agent": UA } });
				if (res.status === 429 || res.status >= 500) {
					console.log(`  ${b.id}: ${res.status}, backing off`);
					await sleep(GAP_MS * 2 ** attempt);
					continue;
				}
				if (!res.ok) {
					console.log(`  ${b.id}: HTTP ${res.status}`);
					break;
				}
				writeFileSync(path, JSON.stringify({ id: b.id, fetched_at: new Date().toISOString(), url, response: await res.json() }));
				ok = true;
			} catch (err) {
				console.log(`  ${b.id}: ${err instanceof Error ? err.message : err}`);
				await sleep(GAP_MS * 2 ** attempt);
			}
		}
		if (ok) {
			fetched++;
			console.log(`  ${b.id} cached`);
		} else failures.push(b.id);
		await sleep(GAP_MS);
	}
	console.log(`\nBreak forecasts: ${fetched} fetched, ${skipped} already cached, ${failures.length} failed${failures.length ? `: ${failures.join(", ")}` : ""}.`);
	if (fetched + skipped === 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Break forecast collection failed:", err);
		process.exit(1);
	});
}
