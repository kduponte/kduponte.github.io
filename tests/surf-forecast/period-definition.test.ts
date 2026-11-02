import { describe, expect, it } from "vitest";
import { periodDefinitionCheck } from "../../src/lib/surf-forecast/period-definition";

describe("periodDefinitionCheck", () => {
	it("recognises a model that tracks APD on a longer scale", () => {
		// Forecast is a steady 1.4x the average period; the dominant period wanders independently.
		const apd = [5, 6, 7, 5.5, 6.5, 8, 7.5];
		const dpd = [12, 9, 14, 8, 15, 10, 9];
		const triples = apd.map((a, i) => ({ forecast: a * 1.4, apd: a, dpd: dpd[i] }));
		const c = periodDefinitionCheck(triples);
		expect(c?.ratio_to_apd).toBeCloseTo(1.4, 10);
		expect(c?.corr_apd).toBeCloseTo(1, 10);
		expect(c?.tracks).toBe("apd");
	});

	it("recognises a model that tracks the dominant period instead", () => {
		const dpd = [12, 9, 14, 8, 15, 10, 9];
		const apd = [6, 6.2, 5.9, 6.1, 6, 6.3, 5.8];
		const c = periodDefinitionCheck(dpd.map((d, i) => ({ forecast: d * 0.9, apd: apd[i], dpd: d })));
		expect(c?.tracks).toBe("dpd");
		expect(c?.ratio_to_dpd).toBeCloseTo(0.9, 10);
	});

	it("declines to call it when the two correlations are nearly equal", () => {
		const base = [5, 6, 7, 8, 9];
		const c = periodDefinitionCheck(base.map((b) => ({ forecast: b, apd: b, dpd: b * 2 })));
		expect(c?.tracks).toBe("undetermined");
	});

	it("ignores non-positive periods and needs at least three pairs", () => {
		expect(periodDefinitionCheck([{ forecast: 0, apd: 5, dpd: 9 }])).toBeNull();
		expect(
			periodDefinitionCheck([
				{ forecast: 7, apd: 5, dpd: 9 },
				{ forecast: 8, apd: 6, dpd: 10 },
			]),
		).toBeNull();
	});
});
