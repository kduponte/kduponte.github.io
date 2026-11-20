// One archived moment per buoy, for the 3D buoy on the page hero.
//
// The hero shows a real reading rather than a live one: NDBC's realtime files cannot be fetched
// from a browser, and every other figure on this page comes from the frozen archive anyway. Each
// buoy gets one hour from the analysis window, chosen so it is neither the best nor the worst day
// for the forecasts but a typical one: the hour whose average miss across the three forecasting
// systems is closest to that buoy's median average miss. Ties go to the later hour, so the choice
// is deterministic.
//
// Heights are what the forecasts are scored on, so heights are the only thing compared. Period
// and direction come from the buoy alone (dominant period DPD and its direction MWD), to set the
// spacing, speed and heading of the drawn swell; model periods are not comparable to the buoy's
// (see period-definition.ts), so they are not drawn.
import { nearestWithin, type Observation } from "./matching";
import type { ForecastSystem } from "./models";
import { BUOYS, regionOfStation, type Region } from "./spots";

export type Instrument = "waverider" | "discus";

/**
 * Every station in this set is a Datawell Waverider, a 0.9 m sphere, except Monterey: NDBC 46042
 * is a 3 m foam hull with a tower, which is also why it is the only one reporting wind (each
 * station's NDBC page, public/data/surf-forecast/buoy-stations.json, names its hull).
 */
export const DISCUS_STATIONS = new Set(["46042"]);

export function instrumentFor(station: string): Instrument {
	return DISCUS_STATIONS.has(station) ? "discus" : "waverider";
}

/** The three independent systems, in the legend order the charts use. */
export const SNAPSHOT_SYSTEMS: ForecastSystem[] = ["ecmwf", "noaa", "dwd"];

export interface SnapshotCandidate {
	valid_time: string;
	observed_height_m: number;
	dominant_period_s: number;
	direction_deg: number;
	forecasts: Record<ForecastSystem, number>;
}

/** Mean absolute miss across the three systems' height forecasts, in metres. */
export function meanAbsMiss(c: SnapshotCandidate): number {
	return SNAPSHOT_SYSTEMS.reduce((s, sys) => s + Math.abs(c.forecasts[sys] - c.observed_height_m), 0) / SNAPSHOT_SYSTEMS.length;
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface TypicalHour {
	candidate: SnapshotCandidate;
	median_mean_abs_miss_m: number;
	candidates_n: number;
}

/** The hour whose average miss is closest to the median average miss; later hour on ties. */
export function chooseTypicalHour(candidates: SnapshotCandidate[]): TypicalHour | null {
	if (candidates.length === 0) return null;
	const target = median(candidates.map(meanAbsMiss));
	let best = candidates[0];
	let bestGap = Math.abs(meanAbsMiss(best) - target);
	for (const c of candidates.slice(1)) {
		const gap = Math.abs(meanAbsMiss(c) - target);
		if (gap < bestGap - 1e-12 || (Math.abs(gap - bestGap) <= 1e-12 && c.valid_time > best.valid_time)) {
			best = c;
			bestGap = gap;
		}
	}
	return { candidate: best, median_mean_abs_miss_m: target, candidates_n: candidates.length };
}

export interface BuoySnapshot {
	station: string;
	name: string;
	region: Region;
	instrument: Instrument;
	valid_time: string;
	lead_days: number;
	observed: {
		wave_height_m: number;
		dominant_period_s: number;
		direction_deg: number;
		/** Sea surface temperature at the buoy (NDBC WTMP), nearest reading within 30 min; null if none. */
		water_temp_c?: number | null;
	};
	forecasts: { system: ForecastSystem; wave_height_m: number; miss_m: number }[];
	/** This buoy's median of the three-system average miss, which the chosen hour matches. */
	median_mean_abs_miss_m: number;
	candidates_n: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function toSnapshot(station: string, leadDays: number, typical: TypicalHour): BuoySnapshot {
	const c = typical.candidate;
	return {
		station,
		name: BUOYS[station]?.name ?? station,
		region: regionOfStation(station),
		instrument: instrumentFor(station),
		valid_time: c.valid_time,
		lead_days: leadDays,
		observed: { wave_height_m: r2(c.observed_height_m), dominant_period_s: r2(c.dominant_period_s), direction_deg: Math.round(c.direction_deg) },
		forecasts: SNAPSHOT_SYSTEMS.map((system) => ({
			system,
			wave_height_m: r2(c.forecasts[system]),
			miss_m: r2(c.forecasts[system] - c.observed_height_m),
		})),
		median_mean_abs_miss_m: r2(typical.median_mean_abs_miss_m),
		candidates_n: typical.candidates_n,
	};
}

// ---------------------------------------------------------------- water temperature

/** Same rule as every other pairing on the page: the single nearest reading within 30 minutes. */
export const WATER_TEMP_WINDOW_MIN = 30;

/**
 * The WTMP column of an NDBC standard meteorological text file (the monthly `stdmet` files), as a
 * time-sorted series. The header row names the columns; times are UTC from YY MM DD hh mm. NDBC
 * writes 999.0 for a missing temperature, so anything outside the range seawater can physically
 * be in (-2 to 40 °C) is dropped.
 */
export function parseNdbcWaterTemp(text: string): Observation[] {
	const lines = text.split(/\r?\n/);
	const header = (lines.find((l) => l.startsWith("#YY")) ?? "").replace(/^#/, "").trim().split(/\s+/);
	const col = (name: string) => header.indexOf(name);
	const [yy, mo, dd, hh, mm, wt] = ["YY", "MM", "DD", "hh", "mm", "WTMP"].map(col);
	if ([yy, mo, dd, hh, mm, wt].some((i) => i < 0)) return [];
	const out: Observation[] = [];
	for (const line of lines) {
		if (!line.trim() || line.startsWith("#")) continue;
		const c = line.trim().split(/\s+/);
		const time_ms = Date.UTC(Number(c[yy]), Number(c[mo]) - 1, Number(c[dd]), Number(c[hh]), Number(c[mm]));
		const value = Number(c[wt]);
		if (!Number.isFinite(time_ms) || !Number.isFinite(value) || value < -2 || value > 40) continue;
		out.push({ time_ms, value });
	}
	return out.sort((a, b) => a.time_ms - b.time_ms);
}

/** The sea temperature at a snapshot's hour, to 0.1 °C, or null if the buoy logged none within the window. */
export function waterTempAt(series: Observation[], validTime: string): number | null {
	const m = nearestWithin(series, Date.parse(validTime), WATER_TEMP_WINDOW_MIN);
	return m ? Math.round(m.value * 10) / 10 : null;
}

// ---------------------------------------------------------------- readout text

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const SYSTEM_NAME: Record<ForecastSystem, string> = { noaa: "NOAA", ecmwf: "ECMWF", dwd: "DWD" };

const ft = (m: number) => (m * 3.28084).toFixed(1);
const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(2)} m`;

export interface SnapshotReadout {
	title: string;
	when: string;
	observed: string;
	/** Sea temperature line, or null when the buoy logged none that hour. */
	water: string | null;
	forecasts: { system: ForecastSystem; text: string }[];
	note: string;
}

/** Plain-language readout, shared by the build-time HTML and the in-browser station switcher. */
export function snapshotReadout(s: BuoySnapshot): SnapshotReadout {
	const when = new Date(s.valid_time);
	const date = when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
	const hour = when.toISOString().slice(11, 16);
	const compass = COMPASS[Math.round((((s.observed.direction_deg % 360) + 360) % 360) / 22.5) % 16];
	return {
		title: `${s.name} · ${s.station}`,
		when: `${date}, ${hour} UTC`,
		observed: `Buoy measured ${s.observed.wave_height_m.toFixed(2)} m (${ft(s.observed.wave_height_m)} ft) at ${s.observed.dominant_period_s.toFixed(0)} s from ${compass} (${s.observed.direction_deg}°)`,
		water:
			typeof s.observed.water_temp_c === "number"
				? `Sea surface ${s.observed.water_temp_c.toFixed(1)} °C (${((s.observed.water_temp_c * 9) / 5 + 32).toFixed(0)} °F)`
				: null,
		forecasts: s.forecasts.map((f) => ({
			system: f.system,
			text: `${SYSTEM_NAME[f.system]} ${f.wave_height_m.toFixed(2)} m (${signed(f.miss_m)})`,
		})),
		note: `Forecast ${s.lead_days} day${s.lead_days === 1 ? "" : "s"} ahead. A typical hour for this buoy: the three systems' average miss matches its median, ${s.median_mean_abs_miss_m.toFixed(2)} m, across ${s.candidates_n.toLocaleString("en-US")} hours.`,
	};
}
