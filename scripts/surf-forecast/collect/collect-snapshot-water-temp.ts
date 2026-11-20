// Sea surface temperature for the 3D buoy's snapshot hours.
//
// The observation archive (collect-observations.ts) holds waves and wind only. The hero diorama
// colors its water by the sea temperature at each buoy's snapshot hour, so this reads NDBC's WTMP
// column for just those twelve hours from NDBC's monthly standard meteorological files (the same
// record the archive's ERDDAP mirror served; that mirror no longer hosts the dataset), caches each
// station's month, and writes the nearest reading within 30 minutes into buoy-snapshots.json with
// waterTempAt (tested). Re-run after build-buoy-snapshots, which also re-attaches temperatures from
// this cache when the chosen hours have not changed.
//
// Run: npm run surf-forecast:collect-snapshot-water-temp
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseNdbcWaterTemp, waterTempAt, type BuoySnapshot } from "../../../src/lib/surf-forecast/buoy-snapshot";
import { STDMET_CACHE_DIR, stdmetCachePath, stdmetMonthUrl } from "./wtmp-cache";

const SNAPSHOTS = "public/data/surf-forecast/buoy-snapshots.json";
const GAP_MS = 2500;
const MAX_ATTEMPTS = 4;
const UA = "forecast-gap-buoy-snapshots/1.0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchMonth(url: string): Promise<string | null> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const res = await fetch(url, { headers: { "User-Agent": UA } });
		if (res.status === 429 || res.status >= 500) {
			await sleep(GAP_MS * 2 ** attempt);
			continue;
		}
		if (!res.ok) {
			console.log(`  HTTP ${res.status} for ${url}`);
			return null;
		}
		return gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
	}
	return null;
}

async function main(): Promise<void> {
	const data = JSON.parse(readFileSync(SNAPSHOTS, "utf8")) as { snapshots: BuoySnapshot[] } & Record<string, unknown>;
	mkdirSync(STDMET_CACHE_DIR, { recursive: true });
	for (const s of data.snapshots) {
		const path = stdmetCachePath(s.station, s.valid_time);
		if (!existsSync(path)) {
			const text = await fetchMonth(stdmetMonthUrl(s.station, s.valid_time));
			if (text === null) {
				console.log(`${s.station}: no NDBC file; temperature left unset`);
				continue;
			}
			writeFileSync(path, text);
			await sleep(GAP_MS);
		}
		s.observed.water_temp_c = waterTempAt(parseNdbcWaterTemp(readFileSync(path, "utf8")), s.valid_time);
		console.log(`${s.station} ${s.name.padEnd(22)} ${s.valid_time}  ${s.observed.water_temp_c ?? "no reading"} °C`);
	}
	// Same key order as build-buoy-snapshots.ts writes.
	const { snapshots, water_temp: _old, ...rest } = data;
	const out = { ...rest, water_temp: WATER_TEMP_NOTE, snapshots };
	writeFileSync(SNAPSHOTS, `${JSON.stringify(out, null, "\t")}\n`);
	console.log(`\nWrote water temperatures to ${SNAPSHOTS}`);
}

export const WATER_TEMP_NOTE = {
	source: "NDBC standard meteorological data, WTMP (sea surface temperature), monthly files",
	rule: "Nearest reading within 30 minutes of the snapshot hour; null if none.",
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
