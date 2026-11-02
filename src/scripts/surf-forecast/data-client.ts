// Fetches the frozen public/data/surf-forecast/*.json artifacts at runtime, cached per page load,
// matching the other projects: no live API for the analysis, and no bundling of the dataset into
// every chart's JavaScript. (The Linda Mar toy is the one deliberate live fetch on this page.)
import type { ModelInfo } from "../../lib/surf-forecast/models";
import type { Source, Variable } from "../../lib/surf-forecast/pairs";
import type { VariableConfig } from "../../lib/surf-forecast/skill";
import type { Region } from "../../lib/surf-forecast/spots";

export interface SummaryRow {
	scope: string;
	source: Source;
	variable: Variable;
	lead_days: number;
	n: number;
	bias: number | null;
	mae: number | null;
	rmse: number | null;
	centered_rmse: number | null;
	correlation: number | null;
	relative_mae: number | null;
	share_within: number | null;
	skill: number | null;
	skill_n: number;
}

export interface ComparisonRow {
	a: string;
	b: string;
	kind: "system" | "resolution";
	question: string;
	variable: Variable;
	lead_days: number;
	mean_abs_error_difference: number;
	ci_low: number;
	ci_high: number;
	naive_ci_low: number;
	naive_ci_high: number;
	se_block: number;
	se_naive: number;
	n_values: number;
	n_days: number;
	effective_n: number;
	distinguishable: boolean;
	naively_distinguishable: boolean;
}

export interface CoverageRow {
	station: string;
	region: Region;
	month: string;
	synoptic_hours: number;
	hours_with_obs: number;
	share: number;
}

export interface StationMeta {
	station: string;
	name: string;
	region: Region;
	latitude: number;
	longitude: number;
	height_obs_coverage: number | null;
	models_excluded_as_masked: string[];
}

export interface Metadata {
	generated_at: string;
	window: { start: string; end: string; months: number };
	total_pairs: number;
	model_pairs: number;
	leads: number[];
	variables: Record<Variable, VariableConfig>;
	systems: Record<string, string>;
	models: ModelInfo[];
	regions: Record<Region, string>;
	stations: StationMeta[];
	grid_snapping: { station: string; model: string; grid_lat: number | null; grid_lon: number | null; snap_km: number | null }[];
	period_definition: Record<
		string,
		{ n: number; ratio_to_apd: number; ratio_to_dpd: number; corr_apd: number | null; corr_dpd: number | null; tracks: string } | null
	>;
}

export interface ForecastData {
	decay: SummaryRow[];
	stations: SummaryRow[];
	comparisons: ComparisonRow[];
	coverage: CoverageRow[];
	meta: Metadata;
}

let cached: Promise<ForecastData> | null = null;

export function loadForecastData(): Promise<ForecastData> {
	if (!cached) {
		const get = <T>(name: string) => fetch(`/data/surf-forecast/${name}`).then((r) => r.json() as Promise<T>);
		cached = Promise.all([
			get<{ rows: SummaryRow[] }>("skill_decay.json"),
			get<{ rows: SummaryRow[] }>("stations.json"),
			get<{ rows: ComparisonRow[] }>("comparisons.json"),
			get<{ rows: CoverageRow[] }>("coverage.json"),
			get<Metadata>("metadata.json"),
		]).then(([decay, stations, comparisons, coverage, meta]) => ({
			decay: decay.rows,
			stations: stations.rows,
			comparisons: comparisons.rows,
			coverage: coverage.rows,
			meta,
		}));
	}
	return cached;
}

/** Height is stored in metres and shown in feet, the unit surfers read a forecast in. */
export const METRES_TO_FEET = 3.28084;

export function displayValue(variable: Variable, value: number | null): number | null {
	if (value === null) return null;
	return variable === "wave_height" ? value * METRES_TO_FEET : value;
}

export const DISPLAY_UNIT: Record<Variable, string> = {
	wave_height: "ft",
	wave_period: "s",
	wave_direction: "°",
};
