// Break and buoy registry.
//
// Organized around surf breaks rather than buoys, deliberately. An earlier draft was organized
// around whichever buoys had good data, which quietly let the instrument decide what the project
// was about. The breaks are the point; a buoy is just the nearest thing that measures anything.
//
// That reframing surfaces the real limitation. A buoy floats in deep water kilometres offshore and
// measures open-ocean swell. What you actually ride depends on refraction, bathymetry, shadowing
// and tide, and no buoy measures any of that. There is no free, public, archived record of
// observed surf height at a break anywhere (that data largely sits behind Surfline's paywall), so
// this project asks two separate questions and never mixes them:
//
//   1. Forecast disagreement, at every break. How much do independent sources disagree about the
//      same spot on the same day? Needs no ground truth, so it works everywhere equally.
//   2. Forecast accuracy, only where a buoy is close enough for the comparison to mean anything.
//
// `proxy_tier` encodes rule 2 so no analysis can quietly overclaim. Distances are real
// great-circle values computed from each station's own reported position, not estimates: see
// scripts/surf-forecast/collect/rank-break-buoy-pairs.ts and probe-hawaii-buoys.ts.

export type Region = "hawaii" | "norcal" | "socal";

/**
 * How much the paired buoy can stand in for the break.
 * - `close`: within 15 km. Swell is a large-scale field, so over this distance the open-water
 *   signal is substantially the same and accuracy analysis is defensible.
 * - `marginal`: 15 to 30 km. Accuracy reported with the distance stated alongside.
 * - `disagreement_only`: beyond 30 km, or no meaningful buoy at all. Excluded from accuracy work.
 */
export type ProxyTier = "close" | "marginal" | "disagreement_only";

export interface Buoy {
	station: string;
	name: string;
	latitude: number;
	longitude: number;
	/** Most stations in this set are wave-only Datawell instruments with no anemometer. */
	has_wind: boolean;
	note?: string;
}

/**
 * Twelve distinct stations cover every break below. Collection cost scales with this list, not
 * with the break list, since seven San Diego breaks share a single buoy and four North Shore
 * breaks share another.
 *
 * Station 46012 (Half Moon Bay offshore) was evaluated and rejected: it is never the nearest
 * station to any break in this set, and it reports neither wave direction nor average period.
 */
export const BUOYS: Record<string, Buoy> = {
	"51201": { station: "51201", name: "Waimea Bay", latitude: 21.673, longitude: -158.116, has_wind: false },
	"51202": { station: "51202", name: "Mokapu Point", latitude: 21.414, longitude: -157.681, has_wind: false },
	"51205": { station: "51205", name: "Pauwela, Maui", latitude: 21.018, longitude: -156.421, has_wind: false },
	"51206": { station: "51206", name: "Hilo", latitude: 19.779, longitude: -154.97, has_wind: false },
	"51208": { station: "51208", name: "Hanalei, Kauai", latitude: 22.285, longitude: -159.574, has_wind: false },
	"51211": { station: "51211", name: "Pearl Harbor Entrance", latitude: 21.297, longitude: -157.959, has_wind: false },
	"46237": {
		station: "46237",
		name: "San Francisco Bar",
		latitude: 37.788,
		longitude: -122.634,
		has_wind: false,
		note: "Sits in the Golden Gate approach, where bay outflow and the bar itself affect the sea state.",
	},
	"46042": { station: "46042", name: "Monterey", latitude: 36.789, longitude: -122.404, has_wind: true },
	"46221": { station: "46221", name: "Santa Monica Bay", latitude: 33.86, longitude: -118.641, has_wind: false },
	"46222": { station: "46222", name: "San Pedro", latitude: 33.614, longitude: -118.314, has_wind: false },
	"46224": { station: "46224", name: "Oceanside Offshore", latitude: 33.178, longitude: -117.472, has_wind: false },
	"46254": { station: "46254", name: "Scripps Nearshore", latitude: 32.868, longitude: -117.267, has_wind: false },
};

export interface SurfBreak {
	id: string;
	name: string;
	region: Region;
	/** Finer-grained locality, for labelling. */
	locality: string;
	latitude: number;
	longitude: number;
	/** Swell window the break is open to, in plain terms. */
	facing: string;
	/**
	 * Null where no buoy is a meaningful proxy. Distance alone is not the test: the Kona coast's
	 * nearest reporting station is Hilo, 107 km away on the opposite side of the island facing the
	 * opposite ocean. Pairing those would be worse than admitting there is no buoy, because a
	 * number that looks like evidence does more harm than a blank.
	 */
	buoy_station: string | null;
	buoy_distance_km: number | null;
	proxy_tier: ProxyTier;
	note?: string;
}

export const SURF_BREAKS: SurfBreak[] = [
	// ---------- Hawaii: Oahu, North Shore ----------
	{
		id: "pipeline",
		name: "Pipeline",
		region: "hawaii",
		locality: "North Shore, Oahu",
		latitude: 21.665,
		longitude: -158.053,
		facing: "NW through N",
		buoy_station: "51201",
		buoy_distance_km: 7,
		proxy_tier: "close",
		note: "Shares the Waimea buoy, about three kilometres from Waimea Bay along the same stretch. That one station is what North Shore forecasts actually reference.",
	},
	{
		id: "sunset_beach",
		name: "Sunset Beach",
		region: "hawaii",
		locality: "North Shore, Oahu",
		latitude: 21.679,
		longitude: -158.041,
		facing: "NW through N",
		buoy_station: "51201",
		buoy_distance_km: 8,
		proxy_tier: "close",
	},
	{
		id: "waimea",
		name: "Waimea Bay",
		region: "hawaii",
		locality: "North Shore, Oahu",
		latitude: 21.642,
		longitude: -158.066,
		facing: "NW through N",
		buoy_station: "51201",
		buoy_distance_km: 6,
		proxy_tier: "close",
	},
	{
		id: "haleiwa",
		name: "Haleiwa",
		region: "hawaii",
		locality: "North Shore, Oahu",
		latitude: 21.593,
		longitude: -158.111,
		facing: "NW through N",
		buoy_station: "51201",
		buoy_distance_km: 9,
		proxy_tier: "close",
	},

	// ---------- Hawaii: Oahu, South and East Shores ----------
	{
		id: "ala_moana_bowls",
		name: "Ala Moana Bowls",
		region: "hawaii",
		locality: "South Shore, Oahu",
		latitude: 21.283,
		longitude: -157.846,
		facing: "S through SW",
		buoy_station: "51211",
		buoy_distance_km: 12,
		proxy_tier: "close",
	},
	{
		id: "waikiki",
		name: "Waikiki",
		region: "hawaii",
		locality: "South Shore, Oahu",
		latitude: 21.272,
		longitude: -157.826,
		facing: "S through SW",
		buoy_station: "51211",
		buoy_distance_km: 14,
		proxy_tier: "close",
		note: "The buoy sits at a harbour mouth west of Waikiki. Same south swell window, but different local bathymetry, so treat direction results here more cautiously than height.",
	},
	{
		id: "diamond_head",
		name: "Diamond Head",
		region: "hawaii",
		locality: "South Shore, Oahu",
		latitude: 21.255,
		longitude: -157.805,
		facing: "S through SE",
		buoy_station: "51211",
		buoy_distance_km: 17,
		proxy_tier: "marginal",
		note: "Open further east than the rest of the south shore, so it picks up angles the Pearl Harbor buoy sees weakly or not at all.",
	},
	{
		id: "ewa_beach",
		name: "Ewa Beach",
		region: "hawaii",
		locality: "South Shore, Oahu",
		latitude: 21.312,
		longitude: -158.007,
		facing: "S through SW",
		buoy_station: "51211",
		buoy_distance_km: 5,
		proxy_tier: "close",
	},
	{
		id: "makapuu",
		name: "Makapu'u",
		region: "hawaii",
		locality: "East Shore, Oahu",
		latitude: 21.31,
		longitude: -157.66,
		facing: "E through SE",
		buoy_station: "51202",
		buoy_distance_km: 12,
		proxy_tier: "close",
		note: "The only windward Oahu break in the set, paired with the Mokapu Point buoy. Trade-driven short-period swell rather than the long-period groundswell the other shores run on.",
	},

	// ---------- Hawaii: Maui ----------
	{
		id: "hookipa",
		name: "Ho'okipa",
		region: "hawaii",
		locality: "North Shore, Maui",
		latitude: 20.934,
		longitude: -156.358,
		facing: "NW through NE",
		buoy_station: "51205",
		buoy_distance_km: 11,
		proxy_tier: "close",
	},
	{
		id: "peahi",
		name: "Pe'ahi (Jaws)",
		region: "hawaii",
		locality: "North Shore, Maui",
		latitude: 20.945,
		longitude: -156.305,
		facing: "N through NW",
		buoy_station: "51205",
		buoy_distance_km: 15,
		proxy_tier: "close",
		note: "Only breaks on very large north swell, so the sample here will be small and concentrated at the top of the height range. Worth looking at separately rather than pooling with everything else.",
	},
	{
		id: "honolua",
		name: "Honolua Bay",
		region: "hawaii",
		locality: "West Maui",
		latitude: 21.013,
		longitude: -156.638,
		facing: "N through NW",
		buoy_station: "51205",
		buoy_distance_km: 23,
		proxy_tier: "marginal",
		note: "Around the northwest corner from the buoy and tucked into a bay, so refraction into the point is a large part of what makes it work. Distance understates the difference.",
	},
	{
		id: "lahaina",
		name: "Lahaina Harbor",
		region: "hawaii",
		locality: "West Maui",
		latitude: 20.871,
		longitude: -156.677,
		facing: "W through SW",
		buoy_station: "51205",
		buoy_distance_km: 31,
		proxy_tier: "disagreement_only",
		note: "Excluded for exposure as much as distance. The buoy faces open north Pacific; Lahaina sits inside the lee of Molokai and Lanai and takes south swell wrapping through the channels. The two see different oceans.",
	},

	// ---------- Hawaii: Kauai ----------
	{
		id: "hanalei",
		name: "Hanalei Bay",
		region: "hawaii",
		locality: "North Shore, Kauai",
		latitude: 22.205,
		longitude: -159.503,
		facing: "N through NW",
		buoy_station: "51208",
		buoy_distance_km: 12,
		proxy_tier: "close",
	},
	{
		id: "poipu",
		name: "Poipu",
		region: "hawaii",
		locality: "South Shore, Kauai",
		latitude: 21.874,
		longitude: -159.456,
		facing: "S through SW",
		buoy_station: "51208",
		buoy_distance_km: 47,
		proxy_tier: "disagreement_only",
		note: "The Hanalei buoy is on the opposite side of the island facing the opposite swell window. Same structural problem as Kona.",
	},

	// ---------- Hawaii: Big Island ----------
	{
		id: "honolii",
		name: "Honoli'i",
		region: "hawaii",
		locality: "Hilo, Big Island",
		latitude: 19.767,
		longitude: -155.09,
		facing: "NE through E",
		buoy_station: "51206",
		buoy_distance_km: 13,
		proxy_tier: "close",
	},
	{
		id: "waipio",
		name: "Waipi'o Bay",
		region: "hawaii",
		locality: "Hamakua, Big Island",
		latitude: 20.13,
		longitude: -155.59,
		facing: "N through NE",
		buoy_station: null,
		buoy_distance_km: null,
		proxy_tier: "disagreement_only",
		note: "No usable buoy. The nearest reporting station is Hilo, 76 km away around the northern corner of the island and facing a different swell window.",
	},
	{
		id: "banyans",
		name: "Banyans",
		region: "hawaii",
		locality: "Kona, Big Island",
		latitude: 19.606,
		longitude: -155.976,
		facing: "W through SW",
		buoy_station: null,
		buoy_distance_km: null,
		proxy_tier: "disagreement_only",
		note: "No usable buoy anywhere on the Kona coast. The nearest reporting station is Hilo, 107 km away on the opposite side of the island, facing the opposite ocean. Kona takes northwest wrap and south swell; Hilo takes trade-driven east swell.",
	},

	// ---------- Northern California: Marin through San Mateo ----------
	{
		id: "rodeo_beach",
		name: "Rodeo Beach",
		region: "norcal",
		locality: "Marin Headlands",
		latitude: 37.832,
		longitude: -122.538,
		facing: "W through NW",
		buoy_station: "46237",
		buoy_distance_km: 10,
		proxy_tier: "close",
	},
	{
		id: "ocean_beach_sf",
		name: "Ocean Beach",
		region: "norcal",
		locality: "San Francisco",
		latitude: 37.7594,
		longitude: -122.5107,
		facing: "W through NW",
		buoy_station: "46237",
		buoy_distance_km: 11,
		proxy_tier: "close",
	},
	{
		id: "linda_mar",
		name: "Linda Mar",
		region: "norcal",
		locality: "Pacifica",
		latitude: 37.594,
		longitude: -122.506,
		facing: "W through NW",
		buoy_station: "46237",
		buoy_distance_km: 24,
		proxy_tier: "marginal",
	},
	{
		id: "montara",
		name: "Montara",
		region: "norcal",
		locality: "San Mateo County",
		latitude: 37.552,
		longitude: -122.517,
		facing: "W through NW",
		buoy_station: "46237",
		buoy_distance_km: 28,
		proxy_tier: "marginal",
	},
	{
		id: "mavericks",
		name: "Mavericks",
		region: "norcal",
		locality: "Half Moon Bay",
		latitude: 37.495,
		longitude: -122.5,
		facing: "W through NW",
		buoy_station: "46237",
		buoy_distance_km: 35,
		proxy_tier: "disagreement_only",
		note: "The spot where forecast accuracy matters most and where the observing network helps least. Nothing sits within 35 km, and the reef itself is the whole story: swell focuses over a shallow ramp a kilometre offshore, which no buoy measures.",
	},
	{
		id: "hmb_jetty",
		name: "Half Moon Bay Jetty",
		region: "norcal",
		locality: "Princeton, Half Moon Bay",
		latitude: 37.502,
		longitude: -122.483,
		facing: "W through NW",
		buoy_station: "46237",
		buoy_distance_km: 34,
		proxy_tier: "disagreement_only",
	},

	// ---------- Northern California: Santa Cruz County ----------
	{
		id: "waddell",
		name: "Waddell Creek",
		region: "norcal",
		locality: "Santa Cruz County",
		latitude: 37.095,
		longitude: -122.276,
		facing: "W through NW",
		buoy_station: "46042",
		buoy_distance_km: 36,
		proxy_tier: "disagreement_only",
	},
	{
		id: "steamer_lane",
		name: "Steamer Lane",
		region: "norcal",
		locality: "Santa Cruz",
		latitude: 36.951,
		longitude: -122.026,
		facing: "W through NW",
		buoy_station: "46042",
		buoy_distance_km: 39,
		proxy_tier: "disagreement_only",
		note: "Monterey Bay's own shadowing sits between the break and the buoy, so the pairing is weak for reasons beyond distance.",
	},
	{
		id: "pleasure_point",
		name: "Pleasure Point",
		region: "norcal",
		locality: "Santa Cruz",
		latitude: 36.956,
		longitude: -121.966,
		facing: "S through SW",
		buoy_station: "46042",
		buoy_distance_km: 43,
		proxy_tier: "disagreement_only",
		note: "Faces south into the bay while the buoy faces west into open ocean. Wrong distance and wrong window at once.",
	},

	// ---------- Southern California: Los Angeles ----------
	{
		id: "zuma",
		name: "Zuma",
		region: "socal",
		locality: "Malibu",
		latitude: 34.016,
		longitude: -118.822,
		facing: "S through W",
		buoy_station: "46221",
		buoy_distance_km: 24,
		proxy_tier: "marginal",
	},
	{
		id: "malibu",
		name: "Malibu",
		region: "socal",
		locality: "Los Angeles",
		latitude: 34.037,
		longitude: -118.678,
		facing: "S through W",
		buoy_station: "46221",
		buoy_distance_km: 20,
		proxy_tier: "marginal",
		note: "Heavily shadowed by Point Conception and the Channel Islands, so the open-water signal and the swell that reaches the point can diverge more than distance alone suggests.",
	},
	{
		id: "venice",
		name: "Venice Breakwater",
		region: "socal",
		locality: "Los Angeles",
		latitude: 33.985,
		longitude: -118.473,
		facing: "W through SW",
		buoy_station: "46221",
		buoy_distance_km: 21,
		proxy_tier: "marginal",
	},
	{
		id: "el_porto",
		name: "El Porto",
		region: "socal",
		locality: "Manhattan Beach",
		latitude: 33.902,
		longitude: -118.42,
		facing: "W through SW",
		buoy_station: "46221",
		buoy_distance_km: 21,
		proxy_tier: "marginal",
	},

	// ---------- Southern California: Orange County and north San Diego ----------
	{
		id: "huntington",
		name: "Huntington Beach",
		region: "socal",
		locality: "Orange County",
		latitude: 33.655,
		longitude: -118.004,
		facing: "S through W",
		buoy_station: "46222",
		buoy_distance_km: 29,
		proxy_tier: "marginal",
	},
	{
		id: "trestles",
		name: "Lower Trestles",
		region: "socal",
		locality: "San Clemente",
		latitude: 33.385,
		longitude: -117.593,
		facing: "S through W",
		buoy_station: "46224",
		buoy_distance_km: 26,
		proxy_tier: "marginal",
	},
	{
		id: "san_onofre",
		name: "San Onofre",
		region: "socal",
		locality: "San Diego County",
		latitude: 33.373,
		longitude: -117.566,
		facing: "SW through W",
		buoy_station: "46224",
		buoy_distance_km: 23,
		proxy_tier: "marginal",
	},

	// ---------- Southern California: San Diego ----------
	{
		id: "swamis",
		name: "Swami's",
		region: "socal",
		locality: "Encinitas",
		latitude: 33.035,
		longitude: -117.293,
		facing: "SW through W",
		buoy_station: "46254",
		buoy_distance_km: 19,
		proxy_tier: "marginal",
	},
	{
		id: "del_mar",
		name: "Del Mar",
		region: "socal",
		locality: "Del Mar",
		latitude: 32.959,
		longitude: -117.27,
		facing: "W through SW",
		buoy_station: "46254",
		buoy_distance_km: 10,
		proxy_tier: "close",
	},
	{
		id: "blacks",
		name: "Blacks Beach",
		region: "socal",
		locality: "La Jolla",
		latitude: 32.889,
		longitude: -117.252,
		facing: "W through NW",
		buoy_station: "46254",
		buoy_distance_km: 3,
		proxy_tier: "close",
		note: "Breaks over a submarine canyon that focuses swell, so the nearshore transformation here is unusually dramatic even though the buoy is close.",
	},
	{
		id: "la_jolla_shores",
		name: "La Jolla Shores",
		region: "socal",
		locality: "La Jolla",
		latitude: 32.857,
		longitude: -117.257,
		facing: "W through SW",
		buoy_station: "46254",
		buoy_distance_km: 2,
		proxy_tier: "close",
		note: "The tightest break-to-buoy pairing in the entire project.",
	},
	{
		id: "windansea",
		name: "Windansea",
		region: "socal",
		locality: "La Jolla",
		latitude: 32.833,
		longitude: -117.281,
		facing: "W through SW",
		buoy_station: "46254",
		buoy_distance_km: 4,
		proxy_tier: "close",
	},
	{
		id: "tourmaline",
		name: "Tourmaline",
		region: "socal",
		locality: "Pacific Beach",
		latitude: 32.803,
		longitude: -117.263,
		facing: "W through SW",
		buoy_station: "46254",
		buoy_distance_km: 7,
		proxy_tier: "close",
	},
];

export const REGION_LABEL: Record<Region, string> = {
	hawaii: "Hawaii",
	norcal: "Northern California",
	socal: "Southern California",
};

export function getBreak(id: string): SurfBreak {
	const found = SURF_BREAKS.find((b) => b.id === id);
	if (!found) throw new Error(`Unknown break id: ${id}`);
	return found;
}

export function breaksInRegion(region: Region): SurfBreak[] {
	return SURF_BREAKS.filter((b) => b.region === region);
}

/** Breaks whose buoy is close enough that comparing a forecast to it means something. */
export function accuracyEligibleBreaks(): SurfBreak[] {
	return SURF_BREAKS.filter((b) => b.proxy_tier !== "disagreement_only" && b.buoy_station !== null);
}

/** Distinct stations to collect, so a shared buoy is never fetched twice. */
export function uniqueBuoyStations(): string[] {
	return [...new Set(SURF_BREAKS.map((b) => b.buoy_station).filter((s): s is string => s !== null))];
}

/**
 * The region a buoy belongs to, derived from the breaks it serves rather than declared separately,
 * so the two can never disagree. Throws for a station that serves no break or breaks in more than
 * one region, either of which would mean the registry itself is wrong.
 */
export function regionOfStation(station: string): Region {
	const regions = new Set(SURF_BREAKS.filter((b) => b.buoy_station === station).map((b) => b.region));
	if (regions.size !== 1) throw new Error(`station ${station} maps to ${regions.size} regions`);
	return [...regions][0];
}

export function buoyFor(brk: SurfBreak): Buoy | null {
	return brk.buoy_station ? (BUOYS[brk.buoy_station] ?? null) : null;
}

/** Count of breaks per tier in a region, for stating the sample honestly on the page. */
export function tierCounts(region?: Region): Record<ProxyTier, number> {
	const pool = region ? breaksInRegion(region) : SURF_BREAKS;
	return {
		close: pool.filter((b) => b.proxy_tier === "close").length,
		marginal: pool.filter((b) => b.proxy_tier === "marginal").length,
		disagreement_only: pool.filter((b) => b.proxy_tier === "disagreement_only").length,
	};
}

/**
 * Linda Mar's local profile, used by the conditions toy. Separate from the break registry because
 * the toy answers a different question ("is it good right now") and needs beach-specific
 * thresholds that have nothing to do with forecast accuracy.
 */
export interface SpotProfile {
	name: string;
	latitude: number;
	longitude: number;
	/** Direction the beach looks out toward, degrees true. */
	beach_normal_deg: number;
	flat_threshold_m: number;
	fun_min_m: number;
	firing_min_m: number;
	windswell_period_s: number;
	groundswell_period_s: number;
	junk_onshore_wind_ms: number;
}

export const LINDA_MAR: SpotProfile = {
	name: "Linda Mar, Pacifica",
	latitude: 37.594,
	longitude: -122.506,
	// The crescent faces just south of due west. Pacifica State Beach sits in a bay open to the
	// west-southwest, with Pedro Point to the south and Mori Point to the north, so 260 is a better
	// mid-beach normal than a flat 270.
	beach_normal_deg: 260,
	flat_threshold_m: 0.6,
	fun_min_m: 1.0,
	firing_min_m: 2.5,
	windswell_period_s: 8,
	groundswell_period_s: 12,
	junk_onshore_wind_ms: 5,
};
