// Buoy observations from NOAA's ERDDAP mirror of the NDBC standard meteorological archive.
//
// ERDDAP rather than NDBC's own files because it serves an arbitrary date range in one request,
// with exact station coordinates and NaN for missing values, where NDBC splits history across
// yearly and monthly files and marks gaps with sentinel numbers that look like data (99.0, 999).
//
// One request per buoy per month, cached verbatim and skipped on re-run. Each request reaches an
// hour past both ends of its month so a forecast valid at midnight on the 1st can still find the
// buoy reading from 23:56 the night before; the overlap is deduplicated on load.
//
// Columns: WVHT (significant wave height), DPD (dominant period), APD (average period), MWD (mean
// wave direction, from), plus wind where a station has an anemometer. Only Monterey does.
//
// Run: npx tsx scripts/surf-forecast/collect/collect-observations.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BUOYS } from "../../../src/lib/surf-forecast/spots";
import { WINDOW_MONTHS, monthRange } from "./window";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const CACHE_DIR = "data/surf-forecast/cache/erddap";
const GAP_MS = 2500;
const MAX_ATTEMPTS = 4;
const COLUMNS = "time,WVHT,DPD,APD,MWD,WSPD,WD";

function cachePath(station: string, month: string): string {
	return `${CACHE_DIR}/${station}_${month}.csv`;
}

function isCached(station: string, month: string): boolean {
	const path = cachePath(station, month);
	if (!existsSync(path)) return false;
	// A real response always starts with the two ERDDAP header lines.
	return readFileSync(path, "utf8").startsWith("time,WVHT");
}

function isoHourOffset(date: string, hours: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + hours * 3_600_000).toISOString().replace(".000Z", "Z");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchChunk(station: string, month: string): Promise<"fetched" | "empty" | "failed"> {
	const { start, end } = monthRange(month);
	const from = isoHourOffset(start, -1);
	// End of the last day plus one hour.
	const to = isoHourOffset(end, 25);
	const url =
		`https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.csv?${COLUMNS}` +
		`&station=%22${station}%22&time%3E=${from}&time%3C=${to}`;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const res = await fetch(url, { headers: { "User-Agent": UA } });
			// ERDDAP answers a query with no matching rows with 404 and a "Your query produced no
			// matching results" body. That is a real answer about the buoy, not a transport error.
			if (res.status === 404) {
				const text = await res.text();
				if (/no matching results/i.test(text)) {
					writeFileSync(cachePath(station, month), `${COLUMNS}\n# no matching results\n`);
					return "empty";
				}
			}
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
			writeFileSync(cachePath(station, month), await res.text());
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
	const tally = { fetched: 0, empty: 0, skipped: 0 };
	const failures: string[] = [];

	for (const station of stations) {
		for (const month of WINDOW_MONTHS) {
			done++;
			if (isCached(station, month)) {
				tally.skipped++;
				continue;
			}
			console.log(`[${done}/${total}] ${station} ${month}`);
			const result = await fetchChunk(station, month);
			if (result === "failed") failures.push(`${station}_${month}`);
			else tally[result]++;
			await sleep(GAP_MS);
		}
	}

	console.log(
		`\nObservations: ${tally.fetched} fetched, ${tally.empty} with no buoy data, ${tally.skipped} already cached, ${failures.length} failed.`,
	);
	if (failures.length) console.log(`Failed chunks (re-run to retry): ${failures.join(", ")}`);
	if (tally.fetched + tally.empty + tally.skipped === 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Observation collection failed:", err);
		process.exit(1);
	});
}
