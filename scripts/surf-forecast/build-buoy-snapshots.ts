// Build: one typical archived hour per buoy, for the 3D buoy on the page hero.
//
// Reads the pairs table for the three systems' one-day-ahead height forecasts, and the buoy
// observation cache for the dominant period and its direction at the same hour, then picks each
// buoy's typical hour with chooseTypicalHour (tested). See src/lib/surf-forecast/buoy-snapshot.ts.
//
// Writes public/data/surf-forecast/buoy-snapshots.json
// Run: npx tsx scripts/surf-forecast/build-buoy-snapshots.ts
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import {
	SNAPSHOT_SYSTEMS,
	chooseTypicalHour,
	toSnapshot,
	type BuoySnapshot,
	type SnapshotCandidate,
} from "../../src/lib/surf-forecast/buoy-snapshot";
import { mergeSeries, nearestWithin, parseErddapCsv, type ObservationSeries } from "../../src/lib/surf-forecast/matching";
import type { ForecastSystem, ModelId } from "../../src/lib/surf-forecast/models";
import { pairFromCsv } from "../../src/lib/surf-forecast/pairs";
import { BUOYS, regionOfStation } from "../../src/lib/surf-forecast/spots";
import { WINDOW_END, WINDOW_MONTHS, WINDOW_START } from "./collect/window";

const PAIRS = "data/surf-forecast/processed/pairs.csv";
const OBS_DIR = "data/surf-forecast/cache/erddap";
const OUT = "public/data/surf-forecast/buoy-snapshots.json";
const LEAD_DAYS = 1;

/** Each system is represented by its finer output, as everywhere else on the page. */
const SYSTEM_OF: Partial<Record<ModelId, ForecastSystem>> = {
	ecmwf_wam: "ecmwf",
	ncep_gfswave016: "noaa",
	gwam: "dwd",
};

interface Partial3 {
	observed: number;
	forecasts: Partial<Record<ForecastSystem, number>>;
}

function loadObservations(station: string): ObservationSeries {
	const parts: ObservationSeries[] = [];
	for (const month of WINDOW_MONTHS) {
		const path = `${OBS_DIR}/${station}_${month}.csv`;
		if (existsSync(path)) parts.push(parseErddapCsv(readFileSync(path, "utf8")));
	}
	return mergeSeries(parts);
}

async function main(): Promise<void> {
	// station -> valid_time -> heights
	const byStation = new Map<string, Map<string, Partial3>>();
	const lines = createInterface({ input: createReadStream(PAIRS) });
	let header = true;
	for await (const line of lines) {
		if (header) {
			header = false;
			continue;
		}
		const r = pairFromCsv(line);
		if (!r || r.variable !== "wave_height" || r.lead_days !== LEAD_DAYS) continue;
		const system = SYSTEM_OF[r.source as ModelId];
		if (!system) continue;
		let times = byStation.get(r.station);
		if (!times) byStation.set(r.station, (times = new Map()));
		let entry = times.get(r.valid_time);
		if (!entry) times.set(r.valid_time, (entry = { observed: r.observed, forecasts: {} }));
		entry.forecasts[system] = r.forecast;
	}

	// Hawaii first, then north to south. Numeric-looking keys would otherwise iterate in number order.
	const regionRank = { hawaii: 0, norcal: 1, socal: 2 } as const;
	const stations = Object.keys(BUOYS).sort(
		(a, b) => regionRank[regionOfStation(a)] - regionRank[regionOfStation(b)] || a.localeCompare(b),
	);

	const snapshots: BuoySnapshot[] = [];
	for (const station of stations) {
		const obs = loadObservations(station);
		const candidates: SnapshotCandidate[] = [];
		for (const [validTime, e] of byStation.get(station) ?? []) {
			if (!SNAPSHOT_SYSTEMS.every((s) => typeof e.forecasts[s] === "number")) continue;
			const ms = Date.parse(validTime);
			const dpd = nearestWithin(obs.DPD, ms);
			const mwd = nearestWithin(obs.MWD, ms);
			if (!dpd || !mwd || !(dpd.value > 0) || !Number.isFinite(mwd.value)) continue;
			candidates.push({
				valid_time: validTime,
				observed_height_m: e.observed,
				dominant_period_s: dpd.value,
				direction_deg: mwd.value,
				forecasts: e.forecasts as Record<ForecastSystem, number>,
			});
		}
		const typical = chooseTypicalHour(candidates);
		if (!typical) {
			console.warn(`${station}: no hour with all three systems and a period/direction reading; skipped`);
			continue;
		}
		const snap = toSnapshot(station, LEAD_DAYS, typical);
		snapshots.push(snap);
		console.log(
			`${station} ${snap.name.padEnd(22)} ${snap.valid_time}  obs ${snap.observed.wave_height_m} m ${snap.observed.dominant_period_s} s ${snap.observed.direction_deg}°  ` +
				snap.forecasts.map((f) => `${f.system} ${f.miss_m >= 0 ? "+" : ""}${f.miss_m}`).join("  ") +
				`  (median miss ${snap.median_mean_abs_miss_m}, n=${snap.candidates_n})`,
		);
	}

	mkdirSync("public/data/surf-forecast", { recursive: true });
	writeFileSync(
		OUT,
		`${JSON.stringify(
			{
				window: { start: WINDOW_START, end: WINDOW_END },
				lead_days: LEAD_DAYS,
				method: "Per buoy, the hour whose mean absolute height miss across ECMWF, NOAA and DWD is closest to that buoy's median; later hour on ties.",
				snapshots,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`\nWrote ${snapshots.length} snapshots to ${OUT}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
