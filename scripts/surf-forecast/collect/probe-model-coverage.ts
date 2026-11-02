// Which wave models actually carry archived lead-time forecasts at each buoy, and where does each
// model's grid put the sample point?
//
// Two things this settles before the backfill is designed around them:
//
//   1. Model set. The semantics gate was run against ncep_gfswave025 only. Every other candidate
//      has to prove it returns real `_previous_dayN` values, not a 200 full of nulls, before it can
//      appear on a chart as a "source."
//   2. Grid snapping. Open-Meteo answers a coordinate with the nearest cell of each model's own
//      grid, so a request at the Monterey buoy (36.789, -122.404) came back from 36.75, -122.5.
//      The distance from the buoy to the cell that actually answered is part of every error number
//      downstream, and it differs by model, so it has to be measured and reported, not assumed.
//
// The first version of this probe counted non-null values and reported ncep_gfswave025 at 100%
// coverage everywhere. At the Waimea buoy every one of those values was exactly 0.0: height,
// period and direction, at every lead. Its 0.25 degree cell straddles Kahuku Point and the land
// mask zeroes it, while gwam's mask treats the same cell as sea. A zero is not missing data to a
// null check, but an open-ocean significant wave height of exactly 0.00 m is physically
// impossible, so this now counts zeros separately and treats them as masked. Coverage is also
// reported per lead, because a model with a shorter horizon looked like a model with no data at
// all when only the minimum across leads was printed.
//
// Run: npx tsx scripts/surf-forecast/collect/probe-model-coverage.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { BUOYS } from "../../../src/lib/surf-forecast/spots";

const UA = "kduponte.github.io surf-forecast research (kduponte@gmail.com)";
const DELAY_MS = 700;
const OUT = "data/surf-forecast/cache/spikes/model-coverage.json";

// meteofrance_wam was on the original list and returns HTTP 400 ("Cannot initialize MultiDomains
// from invalid String value") at every station, so it is not a model this API serves.
const CANDIDATES = ["ncep_gfswave025", "ncep_gfswave016", "ecmwf_wam025", "ecmwf_wam", "gwam"];
const LEADS = [1, 2, 3, 4, 5, 6, 7];
const VARS = ["wave_height", "wave_period", "wave_direction"];
// One week inside the confirmed archive window is enough to separate "has data" from "all nulls".
const START = "2026-06-01";
const END = "2026-06-07";

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Share of hours carrying a physically real value. For height and period that means strictly
 * positive; for direction any number counts, since 0 is due north, but a direction is only worth
 * anything where the matching height is real, and the summary below checks height first.
 */
function realFraction(series: unknown, strictlyPositive: boolean): number {
	if (!Array.isArray(series) || series.length === 0) return 0;
	const real = series.filter((v) => typeof v === "number" && (!strictlyPositive || v > 0)).length;
	return real / series.length;
}

interface Result {
	station: string;
	model: string;
	status: number;
	grid_lat: number | null;
	grid_lon: number | null;
	snap_km: number | null;
	/** Fraction of non-null hours, keyed `variable@lead` with lead 0 for the base value. */
	coverage: Record<string, number>;
	error?: string;
}

async function probe(station: string, model: string): Promise<Result> {
	const buoy = BUOYS[station];
	const hourly = VARS.flatMap((v) => [v, ...LEADS.map((d) => `${v}_previous_day${d}`)]).join(",");
	const qs = new URLSearchParams({
		latitude: String(buoy.latitude),
		longitude: String(buoy.longitude),
		hourly,
		models: model,
		start_date: START,
		end_date: END,
		timezone: "UTC",
		timeformat: "iso8601",
	});
	const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${qs}`, { headers: { "User-Agent": UA } });
	const base: Result = { station, model, status: res.status, grid_lat: null, grid_lon: null, snap_km: null, coverage: {} };
	if (!res.ok) return { ...base, error: (await res.text()).slice(0, 160) };

	const body = (await res.json()) as { latitude: number; longitude: number; hourly?: Record<string, unknown> };
	const h = body.hourly ?? {};
	const coverage: Record<string, number> = {};
	for (const v of VARS) {
		for (const lead of [0, ...LEADS]) {
			const name = lead === 0 ? v : `${v}_previous_day${lead}`;
			// With a single model the keys usually come back unsuffixed, but tolerate both shapes.
			coverage[`${v}@${lead}`] = realFraction(h[name] ?? h[`${name}_${model}`], v !== "wave_direction");
		}
	}
	return {
		...base,
		grid_lat: body.latitude,
		grid_lon: body.longitude,
		snap_km: haversineKm(buoy.latitude, buoy.longitude, body.latitude, body.longitude),
		coverage,
	};
}

async function main(): Promise<void> {
	const results: Result[] = [];
	console.log("Real-value coverage of wave height by lead (0 = latest run). '.' = full, digits = tenths, '-' = none.\n");
	console.log(`${"station".padEnd(8)}${"model".padEnd(17)}${"status".padEnd(7)}${"snap km".padEnd(9)}leads 0..7   period@3 dir@3`);
	for (const station of Object.keys(BUOYS)) {
		for (const model of CANDIDATES) {
			const r = await probe(station, model);
			results.push(r);
			if (r.error) {
				console.log(`${station.padEnd(8)}${model.padEnd(17)}${String(r.status).padEnd(7)}ERROR ${r.error.slice(0, 70)}`);
			} else {
				const cell = (f: number) => (f >= 0.995 ? "." : f <= 0.005 ? "-" : String(Math.min(9, Math.floor(f * 10))));
				const strip = [0, ...LEADS].map((d) => cell(r.coverage[`wave_height@${d}`] ?? 0)).join("");
				const per = `${((r.coverage["wave_period@3"] ?? 0) * 100).toFixed(0)}%`;
				const dir = `${((r.coverage["wave_direction@3"] ?? 0) * 100).toFixed(0)}%`;
				console.log(
					`${station.padEnd(8)}${model.padEnd(17)}${String(r.status).padEnd(7)}${(r.snap_km?.toFixed(1) ?? "?").padEnd(9)}${strip.padEnd(13)}${per.padEnd(9)}${dir}`,
				);
			}
			await new Promise((res) => setTimeout(res, DELAY_MS));
		}
	}
	mkdirSync("data/surf-forecast/cache/spikes", { recursive: true });
	writeFileSync(OUT, `${JSON.stringify({ window: [START, END], leads: [0, ...LEADS], results }, null, "\t")}\n`);
	console.log(`\nWrote ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error("Probe failed:", err);
		process.exit(1);
	});
}
