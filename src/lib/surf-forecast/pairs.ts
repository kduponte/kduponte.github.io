// Turns one cached Open-Meteo response and a station's observations into forecast/observation
// pairs, plus the persistence baseline those forecasts are scored against.
//
// Every exclusion rule lives here, named, so nothing is dropped silently:
//   - a station/model combination whose grid cell is land-masked is skipped outright;
//   - leads beyond a model's archived horizon are skipped;
//   - a forecast height or period that is not strictly positive is treated as masked, not calm;
//   - a forecast with no buoy reading within 30 minutes of its valid hour has no pair.
//
// Period pairs the model's mean wave period with the buoy's average period (APD), mean with mean,
// never with the dominant period (DPD). Mixing them manufactures a systematic bias of several
// seconds that is pure definition and would read as a forecasting failure.
import { isAnalysisHour, nearestWithin, parseOpenMeteoTime, type ObsColumn, type ObservationSeries } from "./matching";
import { LEAD_DAYS, MODEL_IDS, MODELS, isUsable, type ModelId } from "./models";

export type Variable = "wave_height" | "wave_period" | "wave_direction";
export const VARIABLES: Variable[] = ["wave_height", "wave_period", "wave_direction"];

export const OBS_FOR: Record<Variable, ObsColumn> = {
	wave_height: "WVHT",
	wave_period: "APD",
	wave_direction: "MWD",
};

export type Source = ModelId | "persistence";

export interface PairRow {
	station: string;
	/** Valid time, ISO 8601 UTC. */
	valid_time: string;
	variable: Variable;
	source: Source;
	lead_days: number;
	forecast: number;
	observed: number;
	/** Minutes between the buoy reading used and the valid hour. */
	obs_offset_min: number;
}

/** Key for one series in a multi-model response: `wave_height_previous_day3_ecmwf_wam`. */
export function responseKey(variable: Variable, lead: number, model: ModelId): string {
	return lead === 0 ? `${variable}_${model}` : `${variable}_previous_day${lead}_${model}`;
}

function realForecast(variable: Variable, v: unknown): v is number {
	if (typeof v !== "number" || !Number.isFinite(v)) return false;
	if (variable === "wave_direction") return v >= 0 && v <= 360;
	// An exact zero is a masked cell answering, not a flat ocean.
	return v > 0;
}

export interface PairingCounts {
	forecasts_considered: number;
	paired: number;
	no_observation: number;
	masked_value: number;
}

export interface PairingResult {
	rows: PairRow[];
	counts: PairingCounts;
}

/**
 * Pairs every usable model forecast in one response with the nearest buoy reading. Only the four
 * synoptic hours are kept (see isAnalysisHour).
 */
export function pairForecasts(
	station: string,
	hourly: Record<string, unknown>,
	observations: ObservationSeries,
): PairingResult {
	const counts: PairingCounts = { forecasts_considered: 0, paired: 0, no_observation: 0, masked_value: 0 };
	const rows: PairRow[] = [];
	const times = Array.isArray(hourly.time) ? (hourly.time as string[]) : [];

	for (let i = 0; i < times.length; i++) {
		const t = parseOpenMeteoTime(times[i]);
		if (!isAnalysisHour(t)) continue;
		const validIso = new Date(t).toISOString();

		for (const variable of VARIABLES) {
			const match = nearestWithin(observations[OBS_FOR[variable]], t);
			for (const model of MODEL_IDS) {
				if (!isUsable(model, station)) continue;
				for (const lead of LEAD_DAYS) {
					if (lead > MODELS[model].max_lead_days) continue;
					const series = hourly[responseKey(variable, lead, model)];
					if (!Array.isArray(series)) continue;
					counts.forecasts_considered++;
					const value = series[i];
					if (!realForecast(variable, value)) {
						counts.masked_value++;
						continue;
					}
					if (!match) {
						counts.no_observation++;
						continue;
					}
					counts.paired++;
					rows.push({
						station,
						valid_time: validIso,
						variable,
						source: model,
						lead_days: lead,
						forecast: value,
						observed: match.value,
						obs_offset_min: match.offset_min,
					});
				}
			}
		}
	}
	return { rows, counts };
}

/**
 * The persistence baseline: forecast that the sea N days from now will look exactly like the sea
 * now. Built from the buoy alone, on the same synoptic grid as the models, for every lead from 1.
 * Lead 0 is omitted because it would compare a reading with itself.
 *
 * This is what turns "error grows with lead time" into a statement about skill: a forecast only
 * earns its keep at the leads where it beats this.
 */
export function persistencePairs(
	station: string,
	observations: ObservationSeries,
	validTimesMs: number[],
	leads: readonly number[] = LEAD_DAYS,
): PairRow[] {
	const rows: PairRow[] = [];
	for (const t of validTimesMs) {
		if (!isAnalysisHour(t)) continue;
		const validIso = new Date(t).toISOString();
		for (const variable of VARIABLES) {
			const series = observations[OBS_FOR[variable]];
			const now = nearestWithin(series, t);
			if (!now) continue;
			for (const lead of leads) {
				if (lead === 0) continue;
				const then = nearestWithin(series, t - lead * 86_400_000);
				if (!then) continue;
				rows.push({
					station,
					valid_time: validIso,
					variable,
					source: "persistence",
					lead_days: lead,
					forecast: then.value,
					observed: now.value,
					obs_offset_min: now.offset_min,
				});
			}
		}
	}
	return rows;
}

export const PAIR_CSV_HEADER = "station,valid_time,variable,source,lead_days,forecast,observed,obs_offset_min";

export function pairToCsv(r: PairRow): string {
	return `${r.station},${r.valid_time},${r.variable},${r.source},${r.lead_days},${r.forecast},${r.observed},${r.obs_offset_min}`;
}

export function pairFromCsv(line: string): PairRow | null {
	const c = line.split(",");
	if (c.length !== 8 || c[0] === "station") return null;
	return {
		station: c[0],
		valid_time: c[1],
		variable: c[2] as Variable,
		source: c[3] as Source,
		lead_days: Number(c[4]),
		forecast: Number(c[5]),
		observed: Number(c[6]),
		obs_offset_min: Number(c[7]),
	};
}
