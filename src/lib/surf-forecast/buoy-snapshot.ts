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
import type { ForecastSystem } from "./models";
import { BUOYS, regionOfStation, type Region } from "./spots";

export type Instrument = "waverider" | "discus";

/**
 * Every station in this set is a CDIP Datawell Waverider, a 0.9 m sphere, except Monterey: NDBC
 * 46042 is a 3 m discus hull with a mast, which is also why it is the only one reporting wind.
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
	observed: { wave_height_m: number; dominant_period_s: number; direction_deg: number };
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

// ---------------------------------------------------------------- readout text

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const SYSTEM_NAME: Record<ForecastSystem, string> = { noaa: "NOAA", ecmwf: "ECMWF", dwd: "DWD" };

const ft = (m: number) => (m * 3.28084).toFixed(1);
const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(2)} m`;

export interface SnapshotReadout {
	title: string;
	when: string;
	observed: string;
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
		forecasts: s.forecasts.map((f) => ({
			system: f.system,
			text: `${SYSTEM_NAME[f.system]} ${f.wave_height_m.toFixed(2)} m (${signed(f.miss_m)})`,
		})),
		note: `Forecast ${s.lead_days} day${s.lead_days === 1 ? "" : "s"} ahead. A typical hour for this buoy: the three systems' average miss matches its median, ${s.median_mean_abs_miss_m.toFixed(2)} m, across ${s.candidates_n.toLocaleString("en-US")} hours.`,
	};
}
