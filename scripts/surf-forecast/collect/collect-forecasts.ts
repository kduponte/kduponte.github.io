// Retrospective forecast backfill from Open-Meteo's marine archive.
//
// One request per buoy per month, carrying every model, every lead time and every wave variable at
// once, so the whole window costs about a hundred requests rather than thousands. Each response is
// cached verbatim and the collector skips anything already cached, so an interrupted run resumes
// where it stopped and a re-run costs nothing.
//
// Forecasts are sampled at the buoy's coordinates, not the break's, so the comparison downstream
// is buoy against the model cell nearest the buoy. Each model snaps that point to its own grid;
// the cell that actually answered is recorded in the response and carried through to the page.
//
// Pacing: Open-Meteo's free tier weights a request by its variable count and length, and a request
// this wide counts as many calls. Requests run sequentially with a generous gap, and a 429 backs
// off exponentially rather than retrying hot.
//
// Run: npx tsx scripts/surf-forecast/collect/collect-forecasts.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEAD_DAYS, MODEL_IDS } from "../../../src/lib/surf-forecast/models";
import { BUOYS } from "../../../src/lib/surf-forecast/spots";
import { WINDOW_MONTHS, monthRange } from "./window";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const CACHE_DIR = "data/surf-forecast/cache/open-meteo";
const GAP_MS = 6000;
const MAX_ATTEMPTS = 5;
const VARIABLES = ["wave_height", "wave_period", "wave_direction"];

function hourlyParam(): string {
	return VARIABLES.flatMap((v) => LEAD_DAYS.map((d) => (d === 0 ? v : `${v}_previous_day${d}`))).join(",");
}

function cachePath(station: string, month: string): string {
	return `${CACHE_DIR}/${station}_${month}.json`;
}

/** A cached chunk counts only if it parses and covers every hour of its month. */
function isCached(station: string, month: string): boolean {
	const path = cachePath(station, month);
	if (!existsSync(path)) return false;
	try {
		const body = JSON.parse(readFileSync(path, "utf8")) as { response?: { hourly?: { time?: string[] } } };
		const { start, end } = monthRange(month);
		const expectedHours = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 3_600_000) + 24;
		return (body.response?.hourly?.time?.length ?? 0) === expectedHours;
	} catch {
		return false;
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchChunk(station: string, month: string): Promise<"fetched" | "failed"> {
	const buoy = BUOYS[station];
	const { start, end } = monthRange(month);
	const qs = new URLSearchParams({
		latitude: String(buoy.latitude),
		longitude: String(buoy.longitude),
		hourly: hourlyParam(),
		models: MODEL_IDS.join(","),
		start_date: start,
		end_date: end,
		timezone: "UTC",
		timeformat: "iso8601",
	});
	const url = `https://marine-api.open-meteo.com/v1/marine?${qs}`;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const res = await fetch(url, { headers: { "User-Agent": UA } });
			if (res.status === 429 || res.status >= 500) {
				const wait = GAP_MS * 2 ** attempt;
				console.log(`    ${res.status}, backing off ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
				await sleep(wait);
				continue;
			}
			if (!res.ok) {
				console.log(`    HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
				return "failed";
			}
			const response = await res.json();
			writeFileSync(
				cachePath(station, month),
				JSON.stringify({ station, month, fetched_at: new Date().toISOString(), url, response }),
			);
			return "fetched";
		} catch (err) {
			const wait = GAP_MS * 2 ** attempt;
			console.log(`    network error (${err instanceof Error ? err.message : err}), retrying in ${Math.round(wait / 1000)}s`);
			await sleep(wait);
		}
	}
	return "failed";
}

async function main(): Promise<void> {
	mkdirSync(CACHE_DIR, { recursive: true });
	const stations = Object.keys(BUOYS);
	const total = stations.length * WINDOW_MONTHS.length;
	let done = 0;
	let fetched = 0;
	let skipped = 0;
	const failures: string[] = [];

	for (const station of stations) {
		for (const month of WINDOW_MONTHS) {
			done++;
			if (isCached(station, month)) {
				skipped++;
				continue;
			}
			console.log(`[${done}/${total}] ${station} ${month}`);
			const result = await fetchChunk(station, month);
			if (result === "fetched") fetched++;
			else failures.push(`${station}_${month}`);
			await sleep(GAP_MS);
		}
	}

	console.log(`\nForecasts: ${fetched} fetched, ${skipped} already cached, ${failures.length} failed.`);
	if (failures.length) console.log(`Failed chunks (re-run to retry): ${failures.join(", ")}`);
	// Fail the run only if nothing worked, which means an outage rather than one flaky chunk.
	if (fetched + skipped === 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Forecast collection failed:", err);
		process.exit(1);
	});
}
