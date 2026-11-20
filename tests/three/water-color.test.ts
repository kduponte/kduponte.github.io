import { describe, expect, it } from "vitest";
import data from "../../public/data/surf-forecast/buoy-snapshots.json";
import {
	WATER_COLD,
	WATER_UNKNOWN,
	WATER_WARM,
	hexToOklab,
	temperatureDomain,
	temperatureFraction,
	waterColor,
	waterGradientStops,
	waterRamp,
} from "../../src/lib/three/water-color";

describe("waterRamp", () => {
	it("starts at the cold color and ends at the warm one", () => {
		expect(waterRamp(0)).toBe(WATER_COLD);
		expect(waterRamp(1)).toBe(WATER_WARM);
	});

	it("gets lighter with every step warmer", () => {
		const L = waterGradientStops(11).map((c) => hexToOklab(c)[0]);
		for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThan(L[i - 1]);
	});

	it("clamps outside the scale", () => {
		expect(waterRamp(-0.5)).toBe(WATER_COLD);
		expect(waterRamp(2)).toBe(WATER_WARM);
	});
});

describe("temperatureDomain", () => {
	it("rounds the coldest and warmest readings out to whole degrees, ignoring gaps", () => {
		expect(temperatureDomain([15.4, null, 27.7, 22.3, undefined])).toEqual([15, 28]);
	});

	it("never collapses to a single point", () => {
		expect(temperatureDomain([20, 20])).toEqual([20, 21]);
	});

	it("has nothing to say with no readings", () => {
		expect(temperatureDomain([null, undefined])).toBeNull();
	});

	it("spans every snapshot in the frozen data", () => {
		const temps = data.snapshots.map((s) => (s.observed as { water_temp_c?: number | null }).water_temp_c);
		const domain = temperatureDomain(temps)!;
		for (const t of temps) {
			if (typeof t !== "number") continue;
			expect(t).toBeGreaterThanOrEqual(domain[0]);
			expect(t).toBeLessThanOrEqual(domain[1]);
		}
	});
});

describe("waterColor", () => {
	const domain: [number, number] = [15, 28];

	it("places a temperature proportionally along the scale", () => {
		expect(temperatureFraction(21.5, domain)).toBeCloseTo(0.5);
		expect(waterColor(21.5, domain)).toBe(waterRamp(0.5));
	});

	it("draws colder water darker than warmer water", () => {
		expect(hexToOklab(waterColor(15.4, domain))[0]).toBeLessThan(hexToOklab(waterColor(27.7, domain))[0]);
	});

	it("falls back to a neutral when there is no reading", () => {
		expect(waterColor(null, domain)).toBe(WATER_UNKNOWN);
		expect(temperatureFraction(null, domain)).toBeNull();
	});
});
