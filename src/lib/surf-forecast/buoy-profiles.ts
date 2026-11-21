// One profile per buoy, for "The twelve buoys" at the end of the Forecast Gap: what the station is
// (its NDBC station page), what it recorded over the window (coverage.json), how close each
// forecasting system came there (stations.json) and which breaks it is the nearest buoy for (the
// registry). Pure: the section and its 3D lineup read the same profiles in the same order, region
// by region and west to east within each.
import { BUOYS, SURF_BREAKS, regionOfStation, type ProxyTier, type Region } from "./spots";
import { instrumentFor, type Instrument } from "./buoy-snapshot";
import type { ForecastSystem } from "./models";
import type { StationPage } from "./station-page";

export const PROFILE_REGIONS: Region[] = ["hawaii", "norcal", "socal"];
/** The lead the profiles quote, matching the headline findings. */
export const PROFILE_LEAD_DAYS = 3;

export interface CoverageRow {
	station: string;
	month: string;
	synoptic_hours: number;
	hours_with_obs: number;
}

export interface ErrorRow {
	scope: string;
	source: string;
	variable: string;
	lead_days: number;
	n: number;
	mae: number | null;
	bias: number | null;
}

export type ProfilePage = StationPage & { url: string; fetched: string };

export interface BuoyProfile {
	station: string;
	name: string;
	region: Region;
	instrument: Instrument;
	latitude: number;
	longitude: number;
	note?: string;
	page: ProfilePage;
	/** Share of synoptic hours with a wave height reading, by month and over the window. */
	record: { months: { month: string; share: number }[]; share: number };
	/** Wave height error at PROFILE_LEAD_DAYS, per system, in the order given. */
	errors: { system: ForecastSystem; mae_m: number | null; bias_m: number | null; n: number }[];
	/** Every break whose nearest usable buoy this is, nearest first. */
	breaks: { name: string; distance_km: number; tier: ProxyTier }[];
}

export interface ProfileInputs {
	pages: ProfilePage[];
	coverage: CoverageRow[];
	errors: ErrorRow[];
	/** Each system's representative model id, and the order to list systems in. */
	representative: Record<ForecastSystem, string>;
	systems: ForecastSystem[];
}

export function buoyProfiles({ pages, coverage, errors, representative, systems }: ProfileInputs): BuoyProfile[] {
	const out = Object.values(BUOYS).map((b): BuoyProfile => {
		const page = pages.find((p) => p.station === b.station);
		if (!page) throw new Error(`${b.station}: no station page`);
		const rows = coverage.filter((r) => r.station === b.station).sort((a, c) => a.month.localeCompare(c.month));
		if (!rows.length) throw new Error(`${b.station}: no coverage rows`);
		const hours = rows.reduce((a, r) => a + r.synoptic_hours, 0);
		const withObs = rows.reduce((a, r) => a + r.hours_with_obs, 0);
		return {
			station: b.station,
			name: b.name,
			region: regionOfStation(b.station),
			instrument: instrumentFor(b.station),
			latitude: b.latitude,
			longitude: b.longitude,
			...(b.note ? { note: b.note } : {}),
			page,
			record: {
				months: rows.map((r) => ({ month: r.month, share: r.synoptic_hours ? r.hours_with_obs / r.synoptic_hours : 0 })),
				share: hours ? withObs / hours : 0,
			},
			errors: systems.map((system) => {
				const row = errors.find(
					(r) => r.scope === b.station && r.source === representative[system] && r.variable === "wave_height" && r.lead_days === PROFILE_LEAD_DAYS,
				);
				return { system, mae_m: row?.mae ?? null, bias_m: row?.bias ?? null, n: row?.n ?? 0 };
			}),
			breaks: SURF_BREAKS.filter((k) => k.buoy_station === b.station && k.buoy_distance_km !== null)
				.map((k) => ({ name: k.name, distance_km: k.buoy_distance_km as number, tier: k.proxy_tier }))
				.sort((a, c) => a.distance_km - c.distance_km),
		};
	});
	return out.sort((a, c) => PROFILE_REGIONS.indexOf(a.region) - PROFILE_REGIONS.indexOf(c.region) || a.longitude - c.longitude);
}

/** NDBC's hull line in the page's own words, tidied: "3-meter foam buoy w/ seal cage" -> "3 m foam buoy with seal cage". */
export function hullLabel(hull: string): string {
	return hull
		.replace(/(\d+)-meter\b/i, "$1 m")
		.replace(/\bw\/\s*/i, "with ")
		.replace(/\bBuoy\b/, "buoy");
}

/** "Pacific Islands Ocean Observing System (PacIOOS)" -> "PacIOOS"; names without an acronym stay whole. */
export function shortOrg(name: string): string {
	return name.match(/\(([A-Za-z]+)\)\s*$/)?.[1] ?? name;
}

/** Who runs the buoy and who its data comes through, as the station page puts it. */
export function operatorLabel(page: Pick<StationPage, "owner" | "data_from">): string {
	const owner = page.owner ? shortOrg(page.owner) : null;
	const via = page.data_from ? shortOrg(page.data_from) : null;
	if (owner && via && owner !== via) return `${owner}, data from ${via}`;
	return owner ?? via ?? "Not stated";
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Small counts as words, as prose writes them. */
export function countWord(n: number, capital = false): string {
	const w = WORDS[n] ?? String(n);
	return capital ? w[0].toUpperCase() + w.slice(1) : w;
}
