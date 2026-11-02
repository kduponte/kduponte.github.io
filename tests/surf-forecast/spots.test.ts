import { describe, expect, it } from "vitest";
import { BUOYS, SURF_BREAKS, regionOfStation, uniqueBuoyStations } from "../../src/lib/surf-forecast/spots";

describe("break and buoy registry", () => {
	it("pairs every break with a buoy that exists, or with none", () => {
		for (const b of SURF_BREAKS) {
			if (b.buoy_station !== null) expect(BUOYS[b.buoy_station], b.id).toBeDefined();
		}
	});

	it("uses every registered buoy for at least one break", () => {
		expect(new Set(uniqueBuoyStations())).toEqual(new Set(Object.keys(BUOYS)));
	});

	it("keeps proxy tiers consistent with the stated distance thresholds", () => {
		for (const b of SURF_BREAKS) {
			if (b.buoy_distance_km === null) {
				expect(b.proxy_tier, b.id).toBe("disagreement_only");
			} else if (b.buoy_distance_km <= 15) {
				expect(b.proxy_tier, b.id).toBe("close");
			} else if (b.buoy_distance_km <= 30) {
				expect(b.proxy_tier, b.id).toBe("marginal");
			} else {
				expect(b.proxy_tier, b.id).toBe("disagreement_only");
			}
		}
	});

	it("gives every break a unique id", () => {
		expect(new Set(SURF_BREAKS.map((b) => b.id)).size).toBe(SURF_BREAKS.length);
	});
});

describe("regionOfStation", () => {
	it("derives each buoy's region from the breaks it serves", () => {
		expect(regionOfStation("51201")).toBe("hawaii");
		expect(regionOfStation("46237")).toBe("norcal");
		expect(regionOfStation("46254")).toBe("socal");
	});

	it("resolves every registered buoy to exactly one region", () => {
		for (const station of Object.keys(BUOYS)) expect(() => regionOfStation(station)).not.toThrow();
	});

	it("throws for a station no break uses", () => {
		expect(() => regionOfStation("00000")).toThrow();
	});
});
