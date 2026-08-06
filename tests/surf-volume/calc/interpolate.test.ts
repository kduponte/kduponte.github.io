import { describe, expect, it } from "vitest";
import { interpolateWeight } from "../../../src/lib/surf-volume/interpolate";
import { makeObservation } from "../test-helpers";

const candidates = [140, 160, 180, 200].map((weight_lb, i) =>
	makeObservation({
		source_id: "acme",
		weight_lb,
		skill_normalized: "intermediate",
		recommended_volume_point_l: [40, 46, 52, 58][i],
	}),
);

describe("interpolateWeight", () => {
	it("returns an exact match without interpolating", () => {
		const result = interpolateWeight(candidates, 160);
		expect(result).toEqual({ value: 46, wasExactMatch: true });
	});

	it("linearly interpolates between two adjacent weights", () => {
		const result = interpolateWeight(candidates, 150);
		expect(result?.wasExactMatch).toBe(false);
		expect(result?.value).toBeCloseTo(43, 5);
	});

	it("never extrapolates beyond the observed range", () => {
		expect(interpolateWeight(candidates, 100)).toBeNull();
		expect(interpolateWeight(candidates, 300)).toBeNull();
	});

	it("returns null with fewer than 2 usable candidates and no exact match", () => {
		const single = [makeObservation({ source_id: "acme", weight_lb: 160, skill_normalized: "intermediate", recommended_volume_point_l: 46 })];
		expect(interpolateWeight(single, 170)).toBeNull();
	});

	it("returns null for an empty candidate list", () => {
		expect(interpolateWeight([], 160)).toBeNull();
	});
});
