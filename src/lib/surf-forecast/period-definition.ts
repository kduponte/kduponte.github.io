// Which buoy period does a model's "mean wave period" actually correspond to?
//
// This matters because "mean period" is not one quantity. A spectral wave model and a buoy both
// summarise the same wave spectrum, but they can weight it differently: NDBC's average period (APD)
// is a zero-crossing period built from the second spectral moment, while a model's mean period is
// often built from lower moments that weight the long, energetic swell more heavily. For any real
// sea those come out systematically longer. Compare the two directly and every model appears to
// overforecast period by seconds, an error that is entirely definitional.
//
// So before period accuracy is reported at all, this measures the relationship: the ratio of the
// model's period to each buoy period, and how closely it tracks each. A model that runs at a steady
// multiple of APD while correlating strongly with it is tracking the swell correctly and merely
// reporting it on a different scale.
import { pearson } from "./error-metrics";

export interface PeriodTriple {
	forecast: number;
	apd: number;
	dpd: number;
}

export interface PeriodDefinitionCheck {
	n: number;
	mean_forecast: number;
	mean_apd: number;
	mean_dpd: number;
	/** Mean of forecast / APD, taken pair by pair so one big swell cannot dominate it. */
	ratio_to_apd: number;
	ratio_to_dpd: number;
	corr_apd: number | null;
	corr_dpd: number | null;
	/** Which buoy period the model's period follows more closely in shape. */
	tracks: "apd" | "dpd" | "undetermined";
}

export function periodDefinitionCheck(triples: PeriodTriple[]): PeriodDefinitionCheck | null {
	const valid = triples.filter((t) => t.forecast > 0 && t.apd > 0 && t.dpd > 0);
	const n = valid.length;
	if (n < 3) return null;

	const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
	const f = valid.map((t) => t.forecast);
	const apd = valid.map((t) => t.apd);
	const dpd = valid.map((t) => t.dpd);
	const corrApd = pearson(f, apd);
	const corrDpd = pearson(f, dpd);

	let tracks: PeriodDefinitionCheck["tracks"] = "undetermined";
	if (corrApd !== null && corrDpd !== null && Math.abs(corrApd - corrDpd) >= 0.05) {
		tracks = corrApd > corrDpd ? "apd" : "dpd";
	}

	return {
		n,
		mean_forecast: mean(f),
		mean_apd: mean(apd),
		mean_dpd: mean(dpd),
		ratio_to_apd: mean(valid.map((t) => t.forecast / t.apd)),
		ratio_to_dpd: mean(valid.map((t) => t.forecast / t.dpd)),
		corr_apd: corrApd,
		corr_dpd: corrDpd,
		tracks,
	};
}
