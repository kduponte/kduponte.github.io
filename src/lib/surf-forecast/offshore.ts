// Choosing an offshore sample point for each surf break.
//
// A break sits at the shoreline, and at the shoreline a coarse wave model's nearest grid cell is
// often land: it answers with zeros, or with a value for a cell that is half beach. Surf forecast
// sites handle this by quietly picking an offshore "model point" per spot. Here the rule is
// explicit and the same for every break: walk outward from the break along the middle of its swell
// window, which is upstream of the swell that reaches it, and take the nearest candidate where every
// forecasting system returns a real value. The chosen distance and bearing are published per break.

import { circularMeanDeg, normalizeDeg } from "./angles";

const COMPASS: Record<string, number> = {
	N: 0,
	NNE: 22.5,
	NE: 45,
	ENE: 67.5,
	E: 90,
	ESE: 112.5,
	SE: 135,
	SSE: 157.5,
	S: 180,
	SSW: 202.5,
	SW: 225,
	WSW: 247.5,
	W: 270,
	WNW: 292.5,
	NW: 315,
	NNW: 337.5,
};

export function compassToDeg(point: string): number {
	const deg = COMPASS[point.trim().toUpperCase()];
	if (deg === undefined) throw new Error(`unknown compass point: ${point}`);
	return deg;
}

/**
 * The middle of a swell window written as "W through NW", taking the short way round, so
 * "NW through NE" centres on north rather than south.
 */
export function swellWindowCentreDeg(facing: string): number {
	const parts = facing.split(/\s+through\s+/i);
	if (parts.length !== 2) throw new Error(`swell window not in "A through B" form: ${facing}`);
	const centre = circularMeanDeg([compassToDeg(parts[0]), compassToDeg(parts[1])]);
	// Only exactly opposite endpoints have no mean, and no real window is written that way.
	if (centre === null) throw new Error(`swell window endpoints are opposite: ${facing}`);
	return normalizeDeg(centre);
}

const EARTH_RADIUS_KM = 6371;

/** The point reached travelling a great-circle distance along an initial bearing. */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distanceKm: number): { latitude: number; longitude: number } {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const toDeg = (r: number) => (r * 180) / Math.PI;
	const d = distanceKm / EARTH_RADIUS_KM;
	const b = toRad(bearingDeg);
	const p1 = toRad(lat);
	const l1 = toRad(lon);
	const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
	const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
	return { latitude: toDeg(p2), longitude: ((toDeg(l2) + 540) % 360) - 180 };
}

export interface Candidate {
	bearing_deg: number;
	distance_km: number;
	/** How far this bearing sits from the swell window's centre. */
	deviation_deg: number;
	latitude: number;
	longitude: number;
}

/**
 * Candidates in the order they should be tried: nearest first, and at each distance the window's
 * centre before the angled alternatives. The angled bearings exist for coastlines that run
 * obliquely to the swell window, where heading straight out would clip a headland.
 */
export function offshoreCandidates(
	lat: number,
	lon: number,
	facing: string,
	distancesKm: number[] = [5, 10, 15, 20, 30],
	deviationsDeg: number[] = [0, -30, 30],
): Candidate[] {
	const centre = swellWindowCentreDeg(facing);
	const out: Candidate[] = [];
	for (const distance of distancesKm) {
		for (const deviation of deviationsDeg) {
			const bearing = normalizeDeg(centre + deviation);
			const p = destinationPoint(lat, lon, bearing, distance);
			out.push({ bearing_deg: bearing, distance_km: distance, deviation_deg: deviation, ...p });
		}
	}
	return out;
}
