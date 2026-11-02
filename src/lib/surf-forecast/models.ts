// The forecast sources, and which of them are actually independent.
//
// Five model outputs, but only three forecasting systems. NOAA's WAVEWATCH III appears at two grid
// resolutions, and so does ECMWF's WAM: same physics, same atmospheric forcing, different output
// grid. Treating those as five independent opinions would overstate how much the forecasts agree,
// because two outputs of one model agreeing with each other is not corroboration. It also makes
// them useful in a different way: within one system, the gap between the coarse and fine output
// isolates what resolution alone is worth, with the physics held fixed.
//
// Every claim below about coverage was measured, not assumed: see
// scripts/surf-forecast/collect/probe-model-coverage.ts and its evidence file.

export type ModelId = "ncep_gfswave016" | "ncep_gfswave025" | "ecmwf_wam" | "ecmwf_wam025" | "gwam";
export type ForecastSystem = "noaa" | "ecmwf" | "dwd";

export interface ModelInfo {
	id: ModelId;
	system: ForecastSystem;
	/** Short label for charts. */
	label: string;
	/** Which output of its system this is, for the resolution comparison. */
	resolution: "fine" | "coarse";
	/** Longest archived lead time, in days. */
	max_lead_days: number;
	/**
	 * Stations where this model's nearest grid cell is land-masked. The API still answers there,
	 * with exactly 0.0 for height, period and direction at every lead, which a null check reads
	 * as complete coverage. Those pairs are excluded outright rather than filtered row by row.
	 */
	masked_stations: string[];
}

export const MODELS: Record<ModelId, ModelInfo> = {
	ncep_gfswave016: {
		id: "ncep_gfswave016",
		system: "noaa",
		label: "NOAA (0.16°)",
		resolution: "fine",
		max_lead_days: 7,
		masked_stations: [],
	},
	ncep_gfswave025: {
		id: "ncep_gfswave025",
		system: "noaa",
		label: "NOAA (0.25°)",
		resolution: "coarse",
		max_lead_days: 7,
		// Each of these buoys sits close enough to shore that its nearest 0.25 degree cell takes
		// in land: Waimea's cell straddles Kahuku Point, for instance.
		masked_stations: ["46254", "51201", "51206", "51208"],
	},
	ecmwf_wam: {
		id: "ecmwf_wam",
		system: "ecmwf",
		label: "ECMWF (native)",
		resolution: "fine",
		max_lead_days: 7,
		masked_stations: [],
	},
	ecmwf_wam025: {
		id: "ecmwf_wam025",
		system: "ecmwf",
		label: "ECMWF (0.25°)",
		resolution: "coarse",
		max_lead_days: 7,
		masked_stations: [],
	},
	gwam: {
		id: "gwam",
		system: "dwd",
		label: "DWD GWAM",
		resolution: "coarse",
		// The archive carries leads 0 through 6 and nothing at 7.
		max_lead_days: 6,
		masked_stations: [],
	},
};

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

export const SYSTEM_LABEL: Record<ForecastSystem, string> = {
	noaa: "NOAA WAVEWATCH III",
	ecmwf: "ECMWF WAM",
	dwd: "DWD GWAM",
};

/** Lead times collected, in days. Lead 0 is the latest run before the valid time. */
export const LEAD_DAYS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** True when a station/model pair can be used at all. */
export function isUsable(model: ModelId, station: string): boolean {
	return !MODELS[model].masked_stations.includes(station);
}

/** The finer output of each independent system: the representative for cross-system claims. */
export function representativeModels(): ModelId[] {
	const bySystem = new Map<ForecastSystem, ModelId>();
	for (const m of Object.values(MODELS)) {
		const current = bySystem.get(m.system);
		if (!current || (m.resolution === "fine" && MODELS[current].resolution !== "fine")) bySystem.set(m.system, m.id);
	}
	return [...bySystem.values()];
}
