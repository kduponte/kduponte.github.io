// NDBC's station page for each of the twelve buoys, for the buoy profiles at the end of the page:
// owner, hull, CDIP number, water depth and sensor heights (parsed by station-page.ts, tested).
// Pages are cached raw (gitignored); the parsed fields are frozen into buoy-stations.json. A page
// describes the station as deployed on the day it was fetched, and the JSON records that day.
//
// Run: npm run surf-forecast:collect-buoy-stations        (uses cached pages where present)
//      npm run surf-forecast:collect-buoy-stations -- --refresh
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { uniqueBuoyStations } from "../../../src/lib/surf-forecast/spots";
import { parseStationPage } from "../../../src/lib/surf-forecast/station-page";

const CACHE = "data/surf-forecast/cache/ndbc-station-pages";
const OUT = "public/data/surf-forecast/buoy-stations.json";
const URL = (s: string) => `https://www.ndbc.noaa.gov/station_page.php?station=${s}`;
const UA = "forecast-gap-station-pages/1.0";
const GAP_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
	const refresh = process.argv.includes("--refresh");
	mkdirSync(CACHE, { recursive: true });
	const fetched: Record<string, string> = {};
	const prior = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { stations: { station: string; fetched: string }[] }) : null;

	const stations = [];
	for (const station of uniqueBuoyStations()) {
		const path = `${CACHE}/${station}.html`;
		if (refresh || !existsSync(path)) {
			const res = await fetch(URL(station), { headers: { "User-Agent": UA } });
			if (!res.ok) throw new Error(`${station}: HTTP ${res.status}`);
			writeFileSync(path, await res.text());
			fetched[station] = new Date().toISOString().slice(0, 10);
			await sleep(GAP_MS);
		}
		const page = parseStationPage(station, readFileSync(path, "utf8"));
		const when = fetched[station] ?? prior?.stations.find((s) => s.station === station)?.fetched ?? new Date().toISOString().slice(0, 10);
		stations.push({ ...page, url: URL(station), fetched: when });
		console.log(
			`${station} ${page.title.padEnd(36)} ${page.hull.padEnd(32)} depth ${String(page.water_depth_m).padStart(5)} m  CDIP ${page.cdip ?? "-"}  ${page.owner ?? page.data_from}`,
		);
	}

	const out = {
		source: "NDBC station pages",
		note: "Each page as NDBC published it on the day fetched, which can postdate the January to September 2026 window.",
		stations,
	};
	writeFileSync(OUT, `${JSON.stringify(out, null, "\t")}\n`);
	console.log(`wrote ${OUT}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
