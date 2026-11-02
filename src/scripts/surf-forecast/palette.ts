// Chart colours for The Forecast Gap.
//
// One hue per independent forecasting system, derived from the site's three brand accents and
// snapped to the nearest steps that pass the categorical checks on the paper surface (#f4f0e6):
// lightness inside the band, chroma above the floor, every pair separable under protanopia and
// deuteranopia (worst all-pairs dE 15.6, target 8) and for full-colour readers (dE 20.5), and at
// least 3:1 against the paper. The raw brand accents failed three of those checks: the blue sat
// just under the lightness band, the green read as grey, and the yellow was 1.8:1 on paper.
//
// Colour follows the system, never its rank, so NOAA is the same blue in every chart.
import type { ForecastSystem, ModelId } from "../../lib/surf-forecast/models";
import { MODELS } from "../../lib/surf-forecast/models";
import type { Source } from "../../lib/surf-forecast/pairs";

export const SYSTEM_COLOR: Record<ForecastSystem, string> = {
	noaa: "#37579e",
	ecmwf: "#1c6227",
	dwd: "#b4820a",
};

/** Persistence is the benchmark, not a fourth system, so it gets a neutral rather than a
 * categorical hue. 3.6:1 on paper: recessive, but still a legible line. */
export const PERSISTENCE_COLOR = "#857c69";

export const SYSTEM_SHORT: Record<ForecastSystem, string> = {
	noaa: "NOAA",
	ecmwf: "ECMWF",
	dwd: "DWD",
};

/** The three systems in a fixed order, which is also the legend order everywhere. */
export const SYSTEM_ORDER: ForecastSystem[] = ["ecmwf", "noaa", "dwd"];

/** Each system is represented by its finer output; the coarse outputs appear only in the
 * resolution comparison. */
export const REPRESENTATIVE: Record<ForecastSystem, ModelId> = {
	ecmwf: "ecmwf_wam",
	noaa: "ncep_gfswave016",
	dwd: "gwam",
};

export function labelFor(source: Source): string {
	return source === "persistence" ? "Persistence" : SYSTEM_SHORT[MODELS[source].system];
}

export function colorFor(source: Source): string {
	return source === "persistence" ? PERSISTENCE_COLOR : SYSTEM_COLOR[MODELS[source].system];
}

export const SERIES_LABELS = [...SYSTEM_ORDER.map((s) => SYSTEM_SHORT[s]), "Persistence"];
export const SERIES_COLORS = [...SYSTEM_ORDER.map((s) => SYSTEM_COLOR[s]), PERSISTENCE_COLOR];

/** An HTML legend: swatch plus name, in the fixed order. Text stays in ink, never the series
 * colour, so identity is carried by the swatch beside it rather than by coloured type. */
export function legendHtml(labels: string[], colors: string[]): string {
	return labels
		.map(
			(l, i) =>
				`<span class="inline-flex items-center gap-2"><span aria-hidden="true" style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${colors[i]}"></span>${l}</span>`,
		)
		.join("");
}
