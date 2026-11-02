// Circular statistics for wave and wind direction.
//
// This module exists because direction is the one variable on this page where the obvious
// arithmetic is silently wrong. A forecast of 350 degrees against an observation of 10 degrees is
// off by 20 degrees, not 340, and a naive mean of [350, 10] returns 180: due south, the exact
// opposite of the true answer. Every direction calculation in this project routes through here so
// that mistake cannot leak into the generic error path.

/** Normalizes any angle into [0, 360). */
export function normalizeDeg(degrees: number): number {
	return ((degrees % 360) + 360) % 360;
}

/**
 * Signed difference forecast - observed, wrapped into [-180, 180).
 * Positive means the forecast was clockwise of (veered from) the observation.
 * Sign is preserved deliberately: bias needs direction, so a source that consistently predicts
 * swell 15 degrees too far north should report +15, not something near zero or near 180.
 */
export function signedAngularDifferenceDeg(forecast: number, observed: number): number {
	const diff = forecast - observed;
	return normalizeDeg(diff + 180) - 180;
}

/** Unsigned separation between two bearings, in [0, 180]. */
export function absAngularDifferenceDeg(a: number, b: number): number {
	return Math.abs(signedAngularDifferenceDeg(a, b));
}

/**
 * Mean resultant length R, in [0, 1]. R is 1 when every bearing agrees and 0 when they cancel out
 * completely. It is the thing that decides whether a circular mean is meaningful at all.
 */
export function meanResultantLength(degrees: number[]): number {
	if (degrees.length === 0) return 0;
	let sumSin = 0;
	let sumCos = 0;
	for (const d of degrees) {
		const rad = (d * Math.PI) / 180;
		sumSin += Math.sin(rad);
		sumCos += Math.cos(rad);
	}
	const n = degrees.length;
	return Math.sqrt((sumSin / n) ** 2 + (sumCos / n) ** 2);
}

/**
 * Circular mean via atan2 of the averaged unit vectors.
 *
 * Returns null when the bearings are too evenly spread for a mean to mean anything (R below a
 * small epsilon), rather than returning an arbitrary angle that looks authoritative. Four bearings
 * at 0/90/180/270 have no average direction, and saying so is better than reporting one.
 */
export function circularMeanDeg(degrees: number[], epsilon = 1e-9): number | null {
	if (degrees.length === 0) return null;
	if (meanResultantLength(degrees) < epsilon) return null;
	let sumSin = 0;
	let sumCos = 0;
	for (const d of degrees) {
		const rad = (d * Math.PI) / 180;
		sumSin += Math.sin(rad);
		sumCos += Math.cos(rad);
	}
	return normalizeDeg((Math.atan2(sumSin, sumCos) * 180) / Math.PI);
}

/** Circular dispersion, 1 - R. Zero means perfectly concentrated, one means fully scattered. */
export function circularDispersion(degrees: number[]): number {
	if (degrees.length === 0) return 1;
	return 1 - meanResultantLength(degrees);
}

const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

/** 16-point compass label, for prose like "onshore at 7 m/s out of the WNW". */
export function degreesToCompass(degrees: number): string {
	const index = Math.round(normalizeDeg(degrees) / 22.5) % 16;
	return COMPASS_POINTS[index];
}

/**
 * Whether a wind bearing is offshore, onshore, or cross-shore for a beach facing `beachNormalDeg`
 * (the direction the beach looks out toward).
 *
 * Wind bearings are "direction the wind comes FROM", the meteorological convention NDBC and
 * Open-Meteo both use. So wind coming from the same bearing the beach faces is blowing onshore,
 * and wind from the opposite bearing is offshore. Getting this backwards would invert the entire
 * rating for the toy, which is why it is its own tested function rather than an inline comparison.
 */
export function windRelationToBeach(
	windFromDeg: number,
	beachNormalDeg: number,
	opts?: { offshoreWithinDeg?: number; onshoreWithinDeg?: number },
): "offshore" | "onshore" | "cross" {
	const offshoreWithin = opts?.offshoreWithinDeg ?? 60;
	const onshoreWithin = opts?.onshoreWithinDeg ?? 60;
	const separationFromOnshore = absAngularDifferenceDeg(windFromDeg, beachNormalDeg);
	if (separationFromOnshore <= onshoreWithin) return "onshore";
	if (separationFromOnshore >= 180 - offshoreWithin) return "offshore";
	return "cross";
}
