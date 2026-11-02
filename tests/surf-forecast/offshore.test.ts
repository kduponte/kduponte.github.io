import { describe, expect, it } from "vitest";
import { compassToDeg, destinationPoint, offshoreCandidates, swellWindowCentreDeg } from "../../src/lib/surf-forecast/offshore";
import { SURF_BREAKS } from "../../src/lib/surf-forecast/spots";

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLon - aLon) / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}

describe("compassToDeg", () => {
	it("maps the 16-point compass", () => {
		expect(compassToDeg("N")).toBe(0);
		expect(compassToDeg("wnw")).toBe(292.5);
		expect(() => compassToDeg("NWW")).toThrow();
	});
});

describe("swellWindowCentreDeg", () => {
	it("centres a window between its two endpoints", () => {
		expect(swellWindowCentreDeg("W through NW")).toBeCloseTo(292.5, 9);
		expect(swellWindowCentreDeg("S through W")).toBeCloseTo(225, 9);
	});

	it("takes the short way across north", () => {
		expect(swellWindowCentreDeg("NW through NE")).toBeCloseTo(0, 9);
		expect(swellWindowCentreDeg("NW through N")).toBeCloseTo(337.5, 9);
	});

	it("parses every swell window in the break registry", () => {
		for (const b of SURF_BREAKS) expect(() => swellWindowCentreDeg(b.facing), b.id).not.toThrow();
	});

	it("rejects text not written as a window", () => {
		expect(() => swellWindowCentreDeg("west")).toThrow();
	});
});

describe("destinationPoint", () => {
	it("lands the requested distance away", () => {
		const p = destinationPoint(21.665, -158.053, 330, 15);
		expect(haversineKm(21.665, -158.053, p.latitude, p.longitude)).toBeCloseTo(15, 6);
	});

	it("moves north for bearing 0 and west for bearing 270", () => {
		const n = destinationPoint(37.6, -122.5, 0, 10);
		expect(n.latitude).toBeGreaterThan(37.6);
		expect(n.longitude).toBeCloseTo(-122.5, 9);
		const w = destinationPoint(37.6, -122.5, 270, 10);
		expect(w.longitude).toBeLessThan(-122.5);
	});
});

describe("offshoreCandidates", () => {
	it("orders nearest first, window centre before the angled alternatives", () => {
		const c = offshoreCandidates(37.594, -122.506, "W through NW", [5, 10], [0, -30, 30]);
		expect(c.map((x) => [x.distance_km, x.deviation_deg])).toEqual([
			[5, 0],
			[5, -30],
			[5, 30],
			[10, 0],
			[10, -30],
			[10, 30],
		]);
		expect(c[0].bearing_deg).toBeCloseTo(292.5, 9);
	});

	it("heads out to sea for a west-facing California break", () => {
		const [first] = offshoreCandidates(37.594, -122.506, "W through NW");
		expect(first.longitude).toBeLessThan(-122.506);
	});
});
