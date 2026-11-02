// Pairing buoy observations with forecasts.
//
// Two rules here decide whether every downstream number is right, so both live in tested code
// rather than inline in a pipeline script.
//
// 1. Filter per column, never per row. NDBC stations interleave their sensors: at Monterey every
//    10-minute row carries wind but only about every third carries waves. Keeping a row because it
//    has *something* in it, then reading its wave height, reads NaN as data or drops real readings,
//    depending on how the parse is written. So each variable gets its own series of only the rows
//    where that variable is real.
//
// 2. Take the single nearest reading within 30 minutes of the forecast's valid hour, and drop the
//    pair if there is none. Never average across the hour: a buoy's 30-minute readings scatter by
//    roughly ten percent on their own, and averaging smooths away exactly the peaks a forecast is
//    being judged on. The offset is kept on every pair so the matching can be audited.

export type ObsColumn = "WVHT" | "DPD" | "APD" | "MWD" | "WSPD" | "WD";
export const OBS_COLUMNS: ObsColumn[] = ["WVHT", "DPD", "APD", "MWD", "WSPD", "WD"];

export interface Observation {
	time_ms: number;
	value: number;
}

export type ObservationSeries = Record<ObsColumn, Observation[]>;

/**
 * Plausibility bounds per column. ERDDAP already turns NDBC's sentinel values (99.0 for height,
 * 999 for direction) into NaN, but a sentinel that slipped through would look exactly like a
 * very large swell, so anything outside a physical range is rejected rather than trusted.
 */
const BOUNDS: Record<ObsColumn, { min: number; max: number; minExclusive: boolean }> = {
	WVHT: { min: 0, max: 25, minExclusive: true },
	DPD: { min: 0, max: 40, minExclusive: true },
	APD: { min: 0, max: 30, minExclusive: true },
	MWD: { min: 0, max: 360, minExclusive: false },
	WSPD: { min: 0, max: 80, minExclusive: false },
	WD: { min: 0, max: 360, minExclusive: false },
};

function plausible(column: ObsColumn, value: number): boolean {
	if (!Number.isFinite(value)) return false;
	const b = BOUNDS[column];
	if (b.minExclusive ? value <= b.min : value < b.min) return false;
	return value <= b.max;
}

function emptySeries(): ObservationSeries {
	return { WVHT: [], DPD: [], APD: [], MWD: [], WSPD: [], WD: [] };
}

/**
 * Parses one ERDDAP `cwwcNDBCMet` CSV response into a separate, time-sorted, de-duplicated series
 * per column. Tolerates the two header lines, blank lines, comment lines, and a response with no
 * data rows at all.
 */
export function parseErddapCsv(text: string): ObservationSeries {
	const series = emptySeries();
	const lines = text.split(/\r?\n/);
	if (lines.length === 0) return series;

	const header = lines[0].split(",").map((h) => h.trim());
	const timeIndex = header.indexOf("time");
	if (timeIndex < 0) return series;
	const columnIndex = new Map<ObsColumn, number>();
	for (const c of OBS_COLUMNS) {
		const i = header.indexOf(c);
		if (i >= 0) columnIndex.set(c, i);
	}

	for (let li = 1; li < lines.length; li++) {
		const line = lines[li].trim();
		if (!line || line.startsWith("#") || line.startsWith("UTC")) continue;
		const cells = line.split(",");
		const timeMs = Date.parse(cells[timeIndex]);
		if (!Number.isFinite(timeMs)) continue;
		for (const [column, i] of columnIndex) {
			const raw = cells[i]?.trim();
			if (!raw || raw === "NaN") continue;
			const value = Number(raw);
			if (plausible(column, value)) series[column].push({ time_ms: timeMs, value });
		}
	}

	for (const c of OBS_COLUMNS) series[c] = sortAndDedupe(series[c]);
	return series;
}

/** Sorts by time and keeps the first reading at any duplicated timestamp, which the one-hour
 * overlap between adjacent monthly downloads produces at every month boundary. */
export function sortAndDedupe(obs: Observation[]): Observation[] {
	const sorted = [...obs].sort((a, b) => a.time_ms - b.time_ms);
	const out: Observation[] = [];
	for (const o of sorted) {
		if (out.length === 0 || out[out.length - 1].time_ms !== o.time_ms) out.push(o);
	}
	return out;
}

/** Concatenates per-month series into one, for matching across month boundaries. */
export function mergeSeries(parts: ObservationSeries[]): ObservationSeries {
	const merged = emptySeries();
	for (const c of OBS_COLUMNS) merged[c] = sortAndDedupe(parts.flatMap((p) => p[c]));
	return merged;
}

export const MATCH_WINDOW_MIN = 30;

export interface Match {
	value: number;
	/** Observation time minus target time, in minutes. Negative means the reading came first. */
	offset_min: number;
}

/**
 * The single reading nearest `targetMs`, if one lies within the window (inclusive). Binary search,
 * since this runs once per forecast row against series of tens of thousands of readings.
 *
 * On an exact tie between a reading before and a reading after, the earlier one wins. Any fixed
 * rule would do; what matters is that it is fixed, so a re-run pairs identically.
 */
export function nearestWithin(series: Observation[], targetMs: number, windowMin = MATCH_WINDOW_MIN): Match | null {
	if (series.length === 0) return null;
	let lo = 0;
	let hi = series.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (series[mid].time_ms < targetMs) lo = mid + 1;
		else hi = mid;
	}
	// `lo` is the first reading at or after the target; `lo - 1` the last one before it.
	const windowMs = windowMin * 60_000;
	let best: Observation | null = null;
	let bestDist = Infinity;
	for (const i of [lo - 1, lo]) {
		if (i < 0 || i >= series.length) continue;
		const dist = Math.abs(series[i].time_ms - targetMs);
		if (dist < bestDist) {
			best = series[i];
			bestDist = dist;
		}
	}
	if (!best || bestDist > windowMs) return null;
	return { value: best.value, offset_min: (best.time_ms - targetMs) / 60_000 };
}

/** Parses an Open-Meteo hourly timestamp. Requests pin timezone=UTC, but the strings come back
 * without a zone designator, and parsing them bare would read them as local time. */
export function parseOpenMeteoTime(time: string): number {
	return Date.parse(time.endsWith("Z") ? time : `${time}:00Z`);
}

/** The analysis grid: 00, 06, 12 and 18 UTC. Errors at adjacent hours are nearly identical, so
 * hourly pairs add rows without adding information, and the four synoptic hours are the cadence
 * at which the global wave models actually differ from one another. */
export function isAnalysisHour(timeMs: number): boolean {
	const d = new Date(timeMs);
	return d.getUTCMinutes() === 0 && d.getUTCHours() % 6 === 0;
}
