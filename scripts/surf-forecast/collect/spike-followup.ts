// Follow-up spikes. The first run answered the cheap questions and left three that actually
// determine the project's shape:
//   A. Where does the marine _previous_dayN archive really start? (The docs' "Jan 2024" is a claim
//      about the weather API; the first spike showed marine returning nothing for 2024 or 2025.)
//   B. Wind returned HTTP 400, which smells like a malformed request rather than missing data,
//      since genuinely-unsupported variables returned 200-with-nulls instead.
//   C. ERDDAP rejected "wvht" as an unrecognized variable, so the dataset is reachable and only
//      the column names were wrong.
//
// Run: npx tsx scripts/surf-forecast/collect/spike-followup.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = "data/surf-forecast/cache/spikes";
const DELAY_MS = 1200;
const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const MONTEREY = { lat: 36.785, lon: -122.469, station: "46042" };

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

function nonNullCount(v: unknown): { total: number; nonNull: number } {
	if (!Array.isArray(v)) return { total: 0, nonNull: 0 };
	return { total: v.length, nonNull: v.filter((x) => x !== null && x !== undefined).length };
}

/** A. Binary-search the real start of the marine previous-runs archive. This single number sets
 * the sample size and therefore what the page is allowed to claim. */
async function findArchiveStart(): Promise<void> {
	console.log("\n=== A. Real start of the marine _previous_dayN archive ===");

	async function hasData(date: string): Promise<boolean> {
		const qs = new URLSearchParams({
			latitude: String(MONTEREY.lat),
			longitude: String(MONTEREY.lon),
			hourly: "wave_height_previous_day3",
			models: "ncep_gfswave025",
			start_date: date,
			end_date: date,
			timezone: "UTC",
			timeformat: "iso8601",
		});
		const { ok, json } = await get(`https://marine-api.open-meteo.com/v1/marine?${qs}`);
		const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly ?? {};
		const key = Object.keys(hourly).find((k) => k.startsWith("wave_height_previous_day3"));
		const { nonNull } = nonNullCount(key ? hourly[key] : undefined);
		await sleep(DELAY_MS);
		return ok && nonNull > 0;
	}

	// Month-by-month scan through 2026 is cheap (9 requests) and more informative than a pure
	// binary search, because it also reveals any holes mid-archive.
	const months = ["2025-09-15", "2025-11-15", "2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15"];
	const found: Record<string, boolean> = {};
	for (const m of months) {
		found[m] = await hasData(m);
		console.log(`  ${m}: ${found[m] ? "data" : "empty"}`);
	}
	const firstWithData = months.find((m) => found[m]);
	console.log(`  => earliest probed date with data: ${firstWithData ?? "none"}`);
	save("followup-archive-start.json", JSON.stringify(found, null, 2));
}

/** B. Wind. Figure out whether the 400 was the suffix, the endpoint, or the date range. */
async function probeWind(): Promise<void> {
	console.log("\n=== B. Wind availability ===");
	const base = { latitude: String(MONTEREY.lat), longitude: String(MONTEREY.lon), timezone: "UTC", timeformat: "iso8601" };

	const cases: { label: string; host: string; params: Record<string, string> }[] = [
		{ label: "forecast: plain wind, future", host: "https://api.open-meteo.com/v1/forecast", params: { ...base, hourly: "wind_speed_10m", forecast_days: "2" } },
		{ label: "forecast: wind + _previous_day3, future", host: "https://api.open-meteo.com/v1/forecast", params: { ...base, hourly: "wind_speed_10m,wind_speed_10m_previous_day3", forecast_days: "2" } },
		{ label: "forecast: wind + _previous_day3, past dates", host: "https://api.open-meteo.com/v1/forecast", params: { ...base, hourly: "wind_speed_10m,wind_speed_10m_previous_day3", start_date: "2026-06-01", end_date: "2026-06-03" } },
		{ label: "previous-runs host: wind, past dates", host: "https://previous-runs-api.open-meteo.com/v1/forecast", params: { ...base, hourly: "wind_speed_10m,wind_speed_10m_previous_day3", start_date: "2026-06-01", end_date: "2026-06-03" } },
		{ label: "historical-forecast host: wind, past dates", host: "https://historical-forecast-api.open-meteo.com/v1/forecast", params: { ...base, hourly: "wind_speed_10m", start_date: "2026-06-01", end_date: "2026-06-03" } },
	];

	for (const c of cases) {
		const { ok, status, text, json } = await get(`${c.host}?${new URLSearchParams(c.params)}`);
		const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly ?? {};
		const summary = Object.keys(hourly)
			.filter((k) => k !== "time")
			.map((k) => {
				const c2 = nonNullCount(hourly[k]);
				return `${k}=${c2.nonNull}/${c2.total}`;
			})
			.join(" ");
		console.log(`  [${ok ? "OK " : String(status)}] ${c.label}: ${ok ? summary : text.slice(0, 160)}`);
		await sleep(DELAY_MS);
	}
}

/** C. ERDDAP with correct column names. Ask the dataset what it actually has first. */
async function probeErddap(): Promise<void> {
	console.log("\n=== C. ERDDAP NDBC dataset ===");
	const info = await get("https://coastwatch.pfeg.noaa.gov/erddap/info/cwwcNDBCMet/index.csv");
	if (!info.ok) {
		console.log(`  info request failed: ${info.status}`);
		return;
	}
	save("followup-erddap-info.csv", info.text);
	const varNames = info.text
		.split("\n")
		.filter((l) => l.startsWith("variable,"))
		.map((l) => l.split(",")[1])
		.filter(Boolean);
	console.log(`  dataset variables: ${varNames.join(", ")}`);
	await sleep(DELAY_MS);

	// Pick the wave-ish columns from whatever the dataset actually calls them.
	const wanted = varNames.filter((v) => /wvht|dpd|apd|mwd|wspd|wd$|time|station/i.test(v));
	if (wanted.length === 0) {
		console.log("  no recognizable wave columns; ERDDAP may not be the right source");
		return;
	}
	const cols = wanted.join(",");
	const url = `https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.csv?${cols}&station=%22${MONTEREY.station}%22&time%3E=2026-06-01T00:00:00Z&time%3C=2026-06-01T06:00:00Z`;
	const res = await get(url);
	save("followup-erddap-query.txt", `URL: ${url}\nSTATUS: ${res.status}\n\n${res.text.slice(0, 3000)}`);
	console.log(`  [${res.ok ? "OK" : String(res.status)}] query with real column names`);
	console.log(res.text.split("\n").slice(0, 6).map((l) => `    ${l}`).join("\n"));
}

async function main(): Promise<void> {
	await findArchiveStart();
	await probeWind();
	await probeErddap();
	console.log(`\nEvidence written to ${CACHE_DIR}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Follow-up spike failed:", err);
		process.exit(1);
	});
}
