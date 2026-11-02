import { describe, expect, it } from "vitest";
import { metersToFeet, rateConditions, type ConditionsInput } from "../../../src/lib/surf-forecast/conditions";
import { LINDA_MAR } from "../../../src/lib/surf-forecast/spots";

function input(overrides: Partial<ConditionsInput>): ConditionsInput {
	return {
		wave_height_m: 1.3,
		wave_period_s: 12,
		wave_direction_deg: 280,
		wind_speed_ms: 2,
		wind_direction_deg: 90,
		valid_time_utc: "2026-09-15T15:00:00Z",
		...overrides,
	};
}

describe("metersToFeet", () => {
	it("converts using the real factor", () => {
		expect(metersToFeet(1)).toBeCloseTo(3.28084, 5);
		expect(metersToFeet(0)).toBe(0);
	});
});

describe("rateConditions: unknown", () => {
	it("returns unknown when any required field is missing, rather than guessing", () => {
		for (const missing of ["wave_height_m", "wave_period_s", "wind_speed_ms", "wind_direction_deg"] as const) {
			const rating = rateConditions(input({ [missing]: null }), LINDA_MAR);
			expect(rating.tier).toBe("unknown");
			expect(rating.reasons.length).toBeGreaterThan(0);
		}
	});

	it("never throws on all-null input", () => {
		const rating = rateConditions(
			input({ wave_height_m: null, wave_period_s: null, wave_direction_deg: null, wind_speed_ms: null, wind_direction_deg: null }),
			LINDA_MAR,
		);
		expect(rating.tier).toBe("unknown");
		expect(rating.wave_height_ft).toBeNull();
	});
});

describe("rateConditions: junk", () => {
	it("calls it junk when the swell is below the flat threshold", () => {
		const rating = rateConditions(input({ wave_height_m: 0.4 }), LINDA_MAR);
		expect(rating.tier).toBe("junk");
	});

	it("calls it junk when onshore wind is blowing it out, even at a rideable size", () => {
		// 1.5 m is comfortably fun-sized; the wind is what ruins it. This is the case that proves
		// wind outranks size at this particular beach.
		const rating = rateConditions(input({ wave_height_m: 1.5, wind_speed_ms: 8, wind_direction_deg: 270 }), LINDA_MAR);
		expect(rating.tier).toBe("junk");
		expect(rating.wind_relation).toBe("onshore");
	});

	it("calls short-period small surf gutless windswell", () => {
		const rating = rateConditions(input({ wave_height_m: 1.0, wave_period_s: 6 }), LINDA_MAR);
		expect(rating.tier).toBe("junk");
		expect(rating.reasons.join(" ")).toContain("windswell");
	});
});

describe("rateConditions: fun", () => {
	it("calls chest-high with light offshore wind fun", () => {
		const rating = rateConditions(input({ wave_height_m: 1.3, wave_period_s: 13, wind_speed_ms: 3, wind_direction_deg: 90 }), LINDA_MAR);
		expect(rating.tier).toBe("fun");
		expect(rating.wind_relation).toBe("offshore");
	});

	it("still calls it fun when the wind is calm rather than offshore", () => {
		const rating = rateConditions(input({ wave_height_m: 1.2, wind_speed_ms: 1 }), LINDA_MAR);
		expect(rating.tier).toBe("fun");
		expect(rating.wind_relation).toBe("calm");
	});
});

describe("rateConditions: firing", () => {
	it("calls it firing once the swell is big on its own", () => {
		const rating = rateConditions(input({ wave_height_m: 2.8 }), LINDA_MAR);
		expect(rating.tier).toBe("firing");
	});

	it("calls solid long-period swell firing below the raw size threshold", () => {
		const rating = rateConditions(input({ wave_height_m: 2.1, wave_period_s: 15 }), LINDA_MAR);
		expect(rating.tier).toBe("firing");
	});

	it("calls solid swell with offshore wind firing", () => {
		const rating = rateConditions(input({ wave_height_m: 1.9, wind_speed_ms: 4, wind_direction_deg: 90 }), LINDA_MAR);
		expect(rating.tier).toBe("firing");
	});
});

describe("rateConditions: wind dominates at this beach", () => {
	// The same swell, flipped only by wind direction, must land in opposite tiers. If this ever
	// fails, the beach normal or the offshore/onshore convention has been inverted somewhere.
	it("turns the same swell from firing to junk purely on wind direction", () => {
		const offshore = rateConditions(input({ wave_height_m: 1.9, wave_period_s: 12, wind_speed_ms: 8, wind_direction_deg: 90 }), LINDA_MAR);
		const onshore = rateConditions(input({ wave_height_m: 1.9, wave_period_s: 12, wind_speed_ms: 8, wind_direction_deg: 270 }), LINDA_MAR);
		expect(offshore.tier).toBe("firing");
		expect(onshore.tier).toBe("junk");
	});
});

describe("rateConditions: output shape", () => {
	it("always gives at least one reason for a non-unknown verdict", () => {
		for (const h of [0.3, 1.2, 3.0]) {
			const rating = rateConditions(input({ wave_height_m: h }), LINDA_MAR);
			expect(rating.tier).not.toBe("unknown");
			expect(rating.reasons.length).toBeGreaterThan(0);
		}
	});

	it("reports height in feet alongside the verdict", () => {
		const rating = rateConditions(input({ wave_height_m: 1.5 }), LINDA_MAR);
		expect(rating.wave_height_ft).toBeCloseTo(4.92, 1);
	});
});
