// Normalize: cached forecasts and observations in, one long-format pairs table out.
//
// Thin by design. Every rule that decides which rows exist (masking, horizons, the 30-minute
// window, the synoptic grid, persistence) lives in src/lib/surf-forecast/pairs.ts and matching.ts
// under test; this script only reads files, calls those functions, and writes the result.
//
// Writes:
//   data/surf-forecast/processed/pairs.csv           every pair (large, gitignored, regenerable)
//   data/surf-forecast/processed/pairing-report.json what was paired, dropped and why (committed)
//
// Run: npx tsx scripts/surf-forecast/normalize/build-pairs.ts
import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	isAnalysisHour,
	mergeSeries,
	nearestWithin,
	parseErddapCsv,
	parseOpenMeteoTime,
	type ObservationSeries,
} from "../../../src/lib/surf-forecast/matching";
import { MODEL_IDS, isUsable, type ModelId } from "../../../src/lib/surf-forecast/models";
import {
	PAIR_CSV_HEADER,
	pairForecasts,
	pairToCsv,
	persistencePairs,
	responseKey,
	type PairingCounts,
} from "../../../src/lib/surf-forecast/pairs";
import { periodDefinitionCheck, type PeriodTriple } from "../../../src/lib/surf-forecast/period-definition";
import { BUOYS } from "../../../src/lib/surf-forecast/spots";
import { WINDOW_END, WINDOW_MONTHS, WINDOW_START } from "../collect/window";

const FORECAST_DIR = "data/surf-forecast/cache/open-meteo";
const OBS_DIR = "data/surf-forecast/cache/erddap";
const OUT_CSV = "data/surf-forecast/processed/pairs.csv";
const OUT_REPORT = "data/surf-forecast/processed/pairing-report.json";

interface StationReport {
	station: string;
	months_with_forecasts: number;
	months_with_observations: number;
	/** Synoptic hours in the window. */
	analysis_hours: number;
	/** Synoptic hours that had a wave-height reading within 30 minutes. */
	hours_with_height_obs: number;
	height_obs_coverage: number;
	models_used: string[];
	models_excluded_as_masked: string[];
	forecast_counts: PairingCounts;
	persistence_pairs: number;
	total_pairs: number;
}

function loadObservations(station: string): { series: ObservationSeries; months: number } {
	const parts: ObservationSeries[] = [];
	for (const month of WINDOW_MONTHS) {
		const path = `${OBS_DIR}/${station}_${month}.csv`;
		if (existsSync(path)) parts.push(parseErddapCsv(readFileSync(path, "utf8")));
	}
	const months = parts.filter((p) => p.WVHT.length > 0).length;
	return { series: mergeSeries(parts), months };
}

function main(): void {
	const out = createWriteStream(OUT_CSV);
	out.write(`${PAIR_CSV_HEADER}\n`);
	const startMs = Date.parse(`${WINDOW_START}T00:00:00Z`);
	const endMs = Date.parse(`${WINDOW_END}T18:00:00Z`);

	const reports: StationReport[] = [];
	let grandTotal = 0;
	// Lead-0 model periods against both buoy periods, pooled per model across stations, so the
	// page can say which buoy period the models' "mean period" actually corresponds to.
	const periodTriples = new Map<ModelId, PeriodTriple[]>(MODEL_IDS.map((m) => [m, []]));

	for (const station of Object.keys(BUOYS)) {
		const { series: obs, months: obsMonths } = loadObservations(station);
		const counts: PairingCounts = { forecasts_considered: 0, paired: 0, no_observation: 0, masked_value: 0 };
		const validTimes = new Set<number>();
		let forecastMonths = 0;
		let written = 0;

		for (const month of WINDOW_MONTHS) {
			const path = `${FORECAST_DIR}/${station}_${month}.json`;
			if (!existsSync(path)) continue;
			const cached = JSON.parse(readFileSync(path, "utf8")) as { response?: { hourly?: Record<string, unknown> } };
			const hourly = cached.response?.hourly;
			if (!hourly) continue;
			forecastMonths++;

			const { rows, counts: c } = pairForecasts(station, hourly, obs);
			counts.forecasts_considered += c.forecasts_considered;
			counts.paired += c.paired;
			counts.no_observation += c.no_observation;
			counts.masked_value += c.masked_value;
			for (const r of rows) out.write(`${pairToCsv(r)}\n`);
			written += rows.length;

			const times = (hourly.time as string[]) ?? [];
			for (let i = 0; i < times.length; i++) {
				const ms = parseOpenMeteoTime(times[i]);
				if (ms >= startMs && ms <= endMs) validTimes.add(ms);
				if (!isAnalysisHour(ms)) continue;
				const apd = nearestWithin(obs.APD, ms);
				const dpd = nearestWithin(obs.DPD, ms);
				if (!apd || !dpd) continue;
				for (const model of MODEL_IDS) {
					if (!isUsable(model, station)) continue;
					const series = hourly[responseKey("wave_period", 0, model)];
					const f = Array.isArray(series) ? series[i] : null;
					if (typeof f === "number" && f > 0) periodTriples.get(model)?.push({ forecast: f, apd: apd.value, dpd: dpd.value });
				}
			}
		}

		const persistence = persistencePairs(station, obs, [...validTimes].sort((a, b) => a - b));
		for (const r of persistence) out.write(`${pairToCsv(r)}\n`);
		written += persistence.length;

		const analysisHours = [...validTimes].filter(isAnalysisHour);
		const hoursWithHeight = analysisHours.filter((ms) => nearestWithin(obs.WVHT, ms) !== null).length;

		const report: StationReport = {
			station,
			months_with_forecasts: forecastMonths,
			months_with_observations: obsMonths,
			analysis_hours: analysisHours.length,
			hours_with_height_obs: hoursWithHeight,
			height_obs_coverage: analysisHours.length ? hoursWithHeight / analysisHours.length : 0,
			models_used: MODEL_IDS.filter((m) => isUsable(m, station)),
			models_excluded_as_masked: MODEL_IDS.filter((m) => !isUsable(m, station)),
			forecast_counts: counts,
			persistence_pairs: persistence.length,
			total_pairs: written,
		};
		reports.push(report);
		grandTotal += written;
		console.log(
			`${station}  fcst months ${forecastMonths}  obs months ${obsMonths}  height coverage ${(report.height_obs_coverage * 100).toFixed(1)}%  ` +
				`pairs ${written.toLocaleString()}  (masked ${counts.masked_value.toLocaleString()}, no obs ${counts.no_observation.toLocaleString()})`,
		);
	}

	out.end();
	const periodDefinition = Object.fromEntries(MODEL_IDS.map((m) => [m, periodDefinitionCheck(periodTriples.get(m) ?? [])]));
	console.log("\nPeriod definition (lead 0): which buoy period does each model's mean period follow?");
	for (const [m, c] of Object.entries(periodDefinition)) {
		if (!c) continue;
		console.log(
			`  ${m.padEnd(16)} n=${String(c.n).padStart(6)}  x APD ${c.ratio_to_apd.toFixed(2)}  x DPD ${c.ratio_to_dpd.toFixed(2)}  ` +
				`r(APD) ${c.corr_apd?.toFixed(3)}  r(DPD) ${c.corr_dpd?.toFixed(3)}  tracks ${c.tracks}`,
		);
	}
	writeFileSync(
		OUT_REPORT,
		`${JSON.stringify(
			{
				window: { start: WINDOW_START, end: WINDOW_END },
				generated_at: new Date().toISOString(),
				total_pairs: grandTotal,
				period_definition: periodDefinition,
				stations: reports,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`\n${grandTotal.toLocaleString()} pairs written to ${OUT_CSV}`);
	console.log(`Report: ${OUT_REPORT}`);
}

main();
