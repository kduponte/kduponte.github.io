// Final spikes. Two questions follow directly from the follow-up results:
//   D. Wind worked on previous-runs-api.open-meteo.com rather than the standard forecast host.
//      Does a marine equivalent exist there, and does it reach further back than the ~Jan 2026
//      start the marine-api host showed? The archive window is the binding constraint on sample
//      size, so an extra year here would matter more than anything else in this project.
//   E. ERDDAP returned exact buoy coordinates and per-station coverage dates. Pull those for all
//      four stations at once: the forecast must be sampled at the buoy's real position, and the
//      coordinates I have been using for Monterey are off by about 5 km.
//
// Run: npx tsx scripts/surf-forecast/collect/spike-final.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = "data/surf-forecast/cache/spikes";
const DELAY_MS = 1200;
const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const STATIONS = ["46042", "51201", "51211", "51206"];

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function save(name: string, contents: string): void {
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(join(CACHE_DIR, name), contents);
}

async function get(url: string): Promise<{ ok: boolean; status: number; text: string; json: unknown }> {
	const res = await fetch(url, { headers: { "User-Agent": UA } });
	const text = await res.text();
	let json: unknown = null;
	try {
		json = JSON.parse(text);
	} catch {
		/* not json */
	}
	return { ok: res.ok, status: res.status, text, json };
}

function nonNull(v: unknown): { total: number; nonNull: number } {
	if (!Array.isArray(v)) return { total: 0, nonNull: 0 };
	return { total: v.length, nonNull: v.filter((x) => x !== null && x !== undefined).length };
}

/** D. Is there a deeper marine archive on the previous-runs host? */
async function probeMarineArchiveHosts(): Promise<void> {
	console.log("\n=== D. Marine archive depth across hosts ===");
	const hosts = [
		"https://previous-runs-api.open-meteo.com/v1/marine",
		"https://marine-api.open-meteo.com/v1/marine",
		"https://historical-forecast-api.open-meteo.com/v1/marine",
	];
	const dates = ["2024-06-15", "2025-06-15", "2026-06-15"];

	for (const host of hosts) {
		for (const date of dates) {
			const qs = new URLSearchParams({
				latitude: "36.787",
				longitude: "-122.408",
				hourly: "wave_height,wave_height_previous_day3",
				models: "ncep_gfswave025",
				start_date: date,
				end_date: date,
				timezone: "UTC",
				timeformat: "iso8601",
			});
			const { ok, status, text, json } = await get(`${host}?${qs}`);
			const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly ?? {};
			const prevKey = Object.keys(hourly).find((k) => k.includes("previous_day3"));
			const baseKey = Object.keys(hourly).find((k) => k.startsWith("wave_height") && !k.includes("previous"));
			const prev = nonNull(prevKey ? hourly[prevKey] : undefined);
			const base = nonNull(baseKey ? hourly[baseKey] : undefined);
			const label = host.replace("https://", "").split(".")[0];
			console.log(
				`  ${label.padEnd(24)} ${date}: ${ok ? `base=${base.nonNull}/${base.total} prev3=${prev.nonNull}/${prev.total}` : `${status} ${text.slice(0, 90)}`}`,
			);
			await sleep(DELAY_MS);
		}
	}
}

/** E. Exact buoy coordinates and real coverage windows, straight from ERDDAP's own metadata. */
async function fetchStationMetadata(): Promise<void> {
	console.log("\n=== E. Buoy metadata from ERDDAP ===");
	const cols = "station,longitude,latitude,station_name,station_location,data_coverage_start,data_coverage_end";
	for (const station of STATIONS) {
		const url =
			`https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.csv?${cols}` +
			`&station=%22${station}%22&time%3E=2026-09-01T00:00:00Z&time%3C=2026-09-01T01:00:00Z`;
		const { ok, status, text } = await get(url);
		if (!ok) {
			console.log(`  ${station}: request failed (${status})`);
			await sleep(DELAY_MS);
			continue;
		}
		const lines = text.trim().split("\n");
		console.log(`  ${station}: ${lines[2] ?? "(no rows in window)"}`);
		await sleep(DELAY_MS);
	}
}

/** E2. Confirm each station actually has wave data in the forecast-archive window, and see how
 * the wave/wind interleaving shows up per station. A station that only reports wind is useless
 * here regardless of how healthy it looks. */
async function checkStationWaveCoverage(): Promise<void> {
	console.log("\n=== E2. Wave coverage in the archive window (2026-06-01, 6h sample) ===");
	const rows: string[] = [];
	for (const station of STATIONS) {
		const url =
			"https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.csv?time,WVHT,DPD,APD,MWD,WSPD,WD" +
			`&station=%22${station}%22&time%3E=2026-06-01T00:00:00Z&time%3C=2026-06-01T06:00:00Z`;
		const { ok, status, text } = await get(url);
		if (!ok) {
			console.log(`  ${station}: failed (${status})`);
			rows.push(`${station},ERROR,${status}`);
			await sleep(DELAY_MS);
			continue;
		}
		const dataLines = text.trim().split("\n").slice(2);
		const total = dataLines.length;
		const withWave = dataLines.filter((l) => {
			const parts = l.split(",");
			return parts[1] && parts[1] !== "NaN";
		}).length;
		const withWind = dataLines.filter((l) => {
			const parts = l.split(",");
			return parts[5] && parts[5] !== "NaN";
		}).length;
		console.log(`  ${station}: ${total} rows, ${withWave} with wave height, ${withWind} with wind`);
		rows.push(`${station},${total},${withWave},${withWind}`);
		save(`followup-erddap-${station}.csv`, text.slice(0, 2000));
		await sleep(DELAY_MS);
	}
	save("followup-station-coverage.csv", `station,rows,with_wave,with_wind\n${rows.join("\n")}\n`);
}

async function main(): Promise<void> {
	await probeMarineArchiveHosts();
	await fetchStationMetadata();
	await checkStationWaveCoverage();
	console.log(`\nEvidence in ${CACHE_DIR}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Final spike failed:", err);
		process.exit(1);
	});
}
