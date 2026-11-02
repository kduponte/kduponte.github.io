// Phase 0 capability spikes for the Surf Forecast Accuracy project.
//
// Every one of these is a gate: several can invalidate the retrospective design entirely, so they
// run before any pipeline code gets written. Nothing here writes to raw/ or processed/; evidence
// lands in data/surf-forecast/cache/spikes/ and a report prints to stdout.
//
// Run: npx tsx scripts/surf-forecast/collect/spike-capabilities.ts
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = "data/surf-forecast/cache/spikes";
const REQUEST_DELAY_MS = 1200;

// Buoy coordinates still need confirming against each NDBC station page (plan item 2). These are
// the working values used for the spikes only.
const MONTEREY = { lat: 36.785, lon: -122.469, station: "46042" };
const LINDA_MAR = { lat: 37.594, lon: -122.506 };

interface SpikeReport {
	id: string;
	question: string;
	passed: boolean | "partial";
	evidence: string;
}

const reports: SpikeReport[] = [];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(id: string, question: string, passed: boolean | "partial", evidence: string): void {
	reports.push({ id, question, passed, evidence });
	const mark = passed === true ? "PASS" : passed === "partial" ? "PARTIAL" : "FAIL";
	console.log(`[${mark}] ${id}: ${evidence}`);
}

function save(name: string, contents: string): void {
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(join(CACHE_DIR, name), contents);
}

/** Marine API request. Always pins UTC + iso8601, since a silent local-time default on one side of
 * the forecast/observation join would corrupt every pairing. */
function marineUrl(params: Record<string, string>): string {
	const qs = new URLSearchParams({ timezone: "UTC", timeformat: "iso8601", ...params });
	return `https://marine-api.open-meteo.com/v1/marine?${qs.toString()}`;
}

function weatherUrl(params: Record<string, string>): string {
	const qs = new URLSearchParams({ timezone: "UTC", timeformat: "iso8601", ...params });
	return `https://api.open-meteo.com/v1/forecast?${qs.toString()}`;
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
	const res = await fetch(url, { headers: { "User-Agent": "kduponte.github.io surf-forecast research (kduponte@gmail.com)" } });
	const text = await res.text();
	let body: unknown = null;
	try {
		body = JSON.parse(text);
	} catch {
		body = null;
	}
	return { ok: res.ok, status: res.status, body, text };
}

function countNonNull(values: unknown): { total: number; nonNull: number } {
	if (!Array.isArray(values)) return { total: 0, nonNull: 0 };
	return { total: values.length, nonNull: values.filter((v) => v !== null && v !== undefined).length };
}

/** S2: which marine variables support the _previous_dayN suffix? Q4 (variable difficulty) needs
 * more than wave_height alone, so this decides whether that question survives. */
async function spikeMarineVariables(): Promise<void> {
	const candidates = ["wave_height", "wave_period", "wave_peak_period", "wave_direction", "swell_wave_height", "swell_wave_period"];
	const supported: string[] = [];
	const unsupported: string[] = [];

	for (const variable of candidates) {
		const url = marineUrl({
			latitude: String(MONTEREY.lat),
			longitude: String(MONTEREY.lon),
			hourly: `${variable},${variable}_previous_day3`,
			forecast_days: "2",
		});
		const { ok, status, body } = await getJson(url);
		const hourly = (body as { hourly?: Record<string, unknown> } | null)?.hourly;
		const series = hourly?.[`${variable}_previous_day3`];
		const { nonNull } = countNonNull(series);
		if (ok && series !== undefined && nonNull > 0) supported.push(variable);
		else unsupported.push(`${variable}(status=${status},nonNull=${nonNull})`);
		await sleep(REQUEST_DELAY_MS);
	}

	record(
		"S2",
		"Which marine variables support _previous_dayN?",
		unsupported.length === 0 ? true : supported.length > 0 ? "partial" : false,
		`supported=[${supported.join(", ")}] unsupported=[${unsupported.join(", ")}]`,
	);
}

/** S6: the marine endpoint has no wind at all. Wind is required for research question 1 and for
 * the Linda Mar toy, so confirm the weather endpoint carries _previous_dayN over past dates. */
async function spikeWindPreviousDay(): Promise<void> {
	const url = weatherUrl({
		latitude: String(MONTEREY.lat),
		longitude: String(MONTEREY.lon),
		hourly: "wind_speed_10m,wind_speed_10m_previous_day3,wind_direction_10m,wind_direction_10m_previous_day3",
		start_date: "2026-06-01",
		end_date: "2026-06-03",
	});
	const { ok, status, body } = await getJson(url);
	const hourly = (body as { hourly?: Record<string, unknown> } | null)?.hourly;
	const speed = countNonNull(hourly?.["wind_speed_10m_previous_day3"]);
	const dir = countNonNull(hourly?.["wind_direction_10m_previous_day3"]);
	record(
		"S6",
		"Does wind support _previous_dayN for past dates?",
		ok && speed.nonNull > 0 && dir.nonNull > 0,
		`status=${status} speed ${speed.nonNull}/${speed.total} non-null, direction ${dir.nonNull}/${dir.total} non-null`,
	);
	await sleep(REQUEST_DELAY_MS);
}

/** S3: how far back does the forecast archive actually reach? This sets the retrospective window
 * and therefore the whole sample-size story. Probe rather than trust the documented "Jan 2024". */
async function spikeArchiveDepth(): Promise<void> {
	const probes = ["2024-01-15", "2024-07-15", "2025-01-15", "2025-07-15", "2026-01-15"];
	const results: string[] = [];
	for (const date of probes) {
		const url = marineUrl({
			latitude: String(MONTEREY.lat),
			longitude: String(MONTEREY.lon),
			hourly: "wave_height,wave_height_previous_day5",
			models: "ncep_gfswave025",
			start_date: date,
			end_date: date,
		});
		const { ok, body } = await getJson(url);
		const hourly = (body as { hourly?: Record<string, unknown> } | null)?.hourly;
		const prev = countNonNull(hourly?.["wave_height_previous_day5_ncep_gfswave025"] ?? hourly?.["wave_height_previous_day5"]);
		results.push(`${date}:${ok ? `${prev.nonNull}/${prev.total}` : "ERR"}`);
		await sleep(REQUEST_DELAY_MS);
	}
	const anyData = results.some((r) => !r.endsWith(":0/24") && !r.endsWith("ERR"));
	record("S3", "How far back does _previous_day5 return real data?", anyData, results.join("  "));
}

/** S4: coverage density across a full month. A sparse archive changes the sample-size claim
 * completely, and that needs stating on the page rather than implying full hourly coverage. */
async function spikeCoverageDensity(): Promise<void> {
	const url = marineUrl({
		latitude: String(MONTEREY.lat),
		longitude: String(MONTEREY.lon),
		hourly: "wave_height,wave_height_previous_day1,wave_height_previous_day3,wave_height_previous_day5,wave_height_previous_day7",
		models: "ncep_gfswave025",
		start_date: "2026-06-01",
		end_date: "2026-06-30",
	});
	const { ok, body, text } = await getJson(url);
	if (!ok) {
		record("S4", "Coverage density over one month", false, `request failed: ${text.slice(0, 200)}`);
		return;
	}
	save("s4-coverage-june2026.json", text);
	const hourly = (body as { hourly?: Record<string, unknown> } | null)?.hourly ?? {};
	const lines = Object.keys(hourly)
		.filter((k) => k !== "time")
		.map((k) => {
			const c = countNonNull(hourly[k]);
			return `${k}=${c.nonNull}/${c.total}`;
		});
	record("S4", "Coverage density over one month", lines.length > 0, lines.join("  "));
	await sleep(REQUEST_DELAY_MS);
}

/** S7, the top risk: is there buoy ground truth for 2024-2025? Yearly archives were listed only
 * through 2023 and current-year data is monthly, leaving a possible hole over exactly the window
 * where forecasts exist. Three candidate paths, cheapest-to-best. */
async function spikeNdbcGroundTruth(): Promise<void> {
	// Candidate 1: NOAA ERDDAP. Best option if it works: arbitrary date ranges, clean CSV, one
	// request. Quotes must be percent-encoded but the comparison operators must NOT be.
	const erddapBase = "https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.csv";
	const erddapQuery = `time,wvht,dpd,apd,mwd&station=%22${MONTEREY.station}%22&time%3E=2025-06-01T00:00:00Z&time%3C=2025-06-01T06:00:00Z`;
	const erddapUrl = `${erddapBase}?${erddapQuery}`;
	try {
		const res = await fetch(erddapUrl, { headers: { "User-Agent": "kduponte.github.io surf-forecast research (kduponte@gmail.com)" } });
		const text = await res.text();
		save("s7-erddap.txt", `URL: ${erddapUrl}\nSTATUS: ${res.status}\n\n${text.slice(0, 4000)}`);
		const looksLikeCsv = res.ok && text.includes("time") && text.split("\n").length > 3;
		record(
			"S7a",
			"ERDDAP serves NDBC history for arbitrary date ranges (2025)?",
			looksLikeCsv,
			looksLikeCsv ? `200, ${text.split("\n").length} lines. First rows:\n${text.split("\n").slice(0, 5).join("\n")}` : `status=${res.status} body=${text.slice(0, 300)}`,
		);
	} catch (err) {
		record("S7a", "ERDDAP serves NDBC history?", false, `threw: ${String(err)}`);
	}
	await sleep(REQUEST_DELAY_MS);

	// Candidate 2: yearly gzipped archives. Confirmed pattern for <=2023; the open question is
	// whether 2024 and 2025 exist yet.
	for (const year of [2023, 2024, 2025]) {
		const url = `https://www.ndbc.noaa.gov/data/historical/stdmet/${MONTEREY.station}h${year}.txt.gz`;
		try {
			const res = await fetch(url, { headers: { "User-Agent": "kduponte.github.io surf-forecast research (kduponte@gmail.com)" } });
			if (!res.ok) {
				record(`S7b-${year}`, `Yearly NDBC archive ${year}`, false, `status=${res.status}`);
			} else {
				const buf = Buffer.from(await res.arrayBuffer());
				let text: string;
				try {
					text = gunzipSync(buf).toString("utf8");
				} catch {
					text = buf.toString("utf8");
				}
				const lines = text.split("\n");
				save(`s7-ndbc-${year}.txt`, lines.slice(0, 40).join("\n"));
				record(`S7b-${year}`, `Yearly NDBC archive ${year}`, lines.length > 100, `${lines.length} lines. Header: ${lines[0]?.slice(0, 90)}`);
			}
		} catch (err) {
			record(`S7b-${year}`, `Yearly NDBC archive ${year}`, false, `threw: ${String(err)}`);
		}
		await sleep(REQUEST_DELAY_MS);
	}

	// Candidate 3: current-year monthly files.
	const monthUrl = `https://www.ndbc.noaa.gov/data/stdmet/Aug/${MONTEREY.station}.txt`;
	try {
		const res = await fetch(monthUrl, { headers: { "User-Agent": "kduponte.github.io surf-forecast research (kduponte@gmail.com)" } });
		const text = res.ok ? await res.text() : "";
		const lines = text.split("\n");
		if (res.ok) save("s7-ndbc-month-aug.txt", lines.slice(0, 40).join("\n"));
		record("S7c", "Current-year monthly NDBC file", res.ok && lines.length > 100, res.ok ? `${lines.length} lines. Header: ${lines[0]?.slice(0, 90)}` : `status=${res.status}`);
	} catch (err) {
		record("S7c", "Current-year monthly NDBC file", false, `threw: ${String(err)}`);
	}
	await sleep(REQUEST_DELAY_MS);
}

/** S5 setup: the semantics gate. Snapshot today's live forecast so that tomorrow's run can check
 * whether _previous_day1 reproduces it. Until that comparison passes, every retrospective number
 * is provisional, because "issued N days before valid time" is still an assumption. */
async function spikeSnapshotForSemantics(): Promise<void> {
	const url = marineUrl({
		latitude: String(LINDA_MAR.lat),
		longitude: String(LINDA_MAR.lon),
		hourly: "wave_height,wave_peak_period,wave_direction",
		models: "ncep_gfswave025",
		forecast_days: "3",
	});
	const { ok, text } = await getJson(url);
	if (!ok) {
		record("S5", "Snapshot today's forecast for tomorrow's semantics check", false, "request failed");
		return;
	}
	const stamp = new Date().toISOString().slice(0, 10);
	save(`s5-snapshot-${stamp}.json`, text);
	record(
		"S5",
		"Snapshot stored for the _previous_dayN semantics gate",
		true,
		`saved s5-snapshot-${stamp}.json. Re-run tomorrow and compare _previous_day1 against these values before trusting any retro number.`,
	);
}

async function main(): Promise<void> {
	console.log("Surf Forecast Accuracy: Phase 0 capability spikes\n");
	await spikeMarineVariables();
	await spikeWindPreviousDay();
	await spikeArchiveDepth();
	await spikeCoverageDensity();
	await spikeNdbcGroundTruth();
	await spikeSnapshotForSemantics();

	console.log("\n=== SUMMARY ===");
	for (const r of reports) {
		const mark = r.passed === true ? "PASS   " : r.passed === "partial" ? "PARTIAL" : "FAIL   ";
		console.log(`${mark} ${r.id.padEnd(9)} ${r.question}`);
	}
	const failed = reports.filter((r) => r.passed === false);
	console.log(`\n${reports.length - failed.length}/${reports.length} passed. Evidence in ${CACHE_DIR}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Spike run failed:", err);
		process.exit(1);
	});
}
