// Conditions rating for the Linda Mar toy.
//
// Deliberately an ordered, explicit decision rule rather than a weighted score, for two reasons:
// every verdict has to be explainable in plain language back to the reader, and every branch has
// to be testable. A scoring black box would be neither.
//
// The ordering encodes something real about this particular beach: wind ruins it more often than
// size saves it. Linda Mar is an exposed, frequently blown-out beach break, so an onshore afternoon
// makes head-high swell unsurfable, while a clean offshore morning makes waist-high fun.
import { degreesToCompass, windRelationToBeach } from "./angles";
import type { SpotProfile } from "./spots";

export type ConditionsTier = "junk" | "fun" | "firing" | "unknown";
export type WindRelation = "offshore" | "onshore" | "cross" | "calm" | "unknown";

export interface ConditionsInput {
	wave_height_m: number | null;
	wave_period_s: number | null;
	wave_direction_deg: number | null;
	wind_speed_ms: number | null;
	wind_direction_deg: number | null;
	valid_time_utc: string;
}

export interface ConditionsRating {
	tier: ConditionsTier;
	wind_relation: WindRelation;
	/** Plain-language justifications, rendered in the UI so the toy shows its work. */
	reasons: string[];
	wave_height_ft: number | null;
	inputs: ConditionsInput;
}

/** Wind at or below this is effectively calm, and direction stops mattering. */
const CALM_WIND_MS = 2;

export function metersToFeet(m: number): number {
	return m * 3.28084;
}

function describeWind(speedMs: number, directionDeg: number, relation: WindRelation): string {
	const knots = Math.round(speedMs * 1.94384);
	return `${relation === "calm" ? "Calm" : relation.charAt(0).toUpperCase() + relation.slice(1)} wind, ${knots} kt out of the ${degreesToCompass(directionDeg)}`;
}

export function rateConditions(input: ConditionsInput, profile: SpotProfile): ConditionsRating {
	const { wave_height_m: height, wave_period_s: period, wind_speed_ms: windSpeed, wind_direction_deg: windDir } = input;

	// Never guess. A missing input produces an explicit unknown, which the UI renders as its own
	// honest state rather than defaulting to a plausible-looking verdict.
	if (height === null || period === null || windSpeed === null || windDir === null) {
		return {
			tier: "unknown",
			wind_relation: "unknown",
			reasons: ["Some of the forecast data did not come through, so there is no honest call to make here."],
			wave_height_ft: height === null ? null : metersToFeet(height),
			inputs: input,
		};
	}

	const relation: WindRelation = windSpeed <= CALM_WIND_MS ? "calm" : windRelationToBeach(windDir, profile.beach_normal_deg);
	const heightFt = metersToFeet(height);
	const reasons: string[] = [];

	const blownOut = relation === "onshore" && windSpeed >= profile.junk_onshore_wind_ms;
	const tooSmall = height < profile.flat_threshold_m;
	const gutlessWindswell = period < profile.windswell_period_s && height < 1.2;

	if (blownOut || tooSmall || gutlessWindswell) {
		if (tooSmall) reasons.push(`Only ${heightFt.toFixed(1)} ft of swell, which is not enough to work with.`);
		if (blownOut) reasons.push(`${describeWind(windSpeed, windDir, relation)}, so it is getting torn apart.`);
		if (gutlessWindswell) reasons.push(`${period.toFixed(0)} second period, so it is local windswell with no push behind it.`);
		return { tier: "junk", wind_relation: relation, reasons, wave_height_ft: heightFt, inputs: input };
	}

	const isBig = height >= profile.firing_min_m;
	const bigAndLongPeriod = height >= 2.0 && period >= 14;
	const solidAndGroomed = height >= 1.8 && relation === "offshore";

	if (isBig || bigAndLongPeriod || solidAndGroomed) {
		reasons.push(`${heightFt.toFixed(1)} ft at ${period.toFixed(0)} seconds.`);
		if (solidAndGroomed) reasons.push(`${describeWind(windSpeed, windDir, relation)}, holding it together.`);
		if (bigAndLongPeriod) reasons.push("Long period groundswell, so there is real energy behind it.");
		return { tier: "firing", wind_relation: relation, reasons, wave_height_ft: heightFt, inputs: input };
	}

	reasons.push(`${heightFt.toFixed(1)} ft at ${period.toFixed(0)} seconds.`);
	reasons.push(`${describeWind(windSpeed, windDir, relation)}.`);
	if (period >= profile.groundswell_period_s) reasons.push("Enough period to be real groundswell rather than local slop.");
	return { tier: "fun", wind_relation: relation, reasons, wave_height_ft: heightFt, inputs: input };
}
