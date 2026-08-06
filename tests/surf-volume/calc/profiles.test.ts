import { describe, expect, it } from "vitest";
import {
	generateDatasetA,
	generateDatasetBArchetypes,
	generateDatasetBSensitivityVariants,
	generateDatasetC,
	heightForWeight,
} from "../../../src/lib/surf-volume/profiles";

describe("sampling design", () => {
	it("Dataset A has exactly 21 profiles (7 weights x 3 skills)", () => {
		expect(generateDatasetA()).toHaveLength(21);
	});

	it("Dataset A profile ids are unique", () => {
		const ids = generateDatasetA().map((p) => p.profile_id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("Dataset B has exactly 6 archetypes", () => {
		expect(generateDatasetBArchetypes()).toHaveLength(6);
	});

	it("Dataset C has exactly 1 profile", () => {
		expect(generateDatasetC()).toBeTruthy();
	});

	it("Dataset B sensitivity variants change exactly one factor from their archetype base", () => {
		const archetypes = new Map(generateDatasetBArchetypes().map((a) => [a.profile_id, a]));
		for (const variant of generateDatasetBSensitivityVariants()) {
			expect(variant.variant_factor).toBeDefined();
			const base = archetypes.get(variant.profile_id.replace(/^sens_/, "").split(`_${variant.variant_factor}_`)[0]);
			expect(base).toBeTruthy();
		}
	});

	it("heightForWeight is non-decreasing across the core weight range", () => {
		const weights = [120, 140, 160, 180, 200, 220, 240];
		const heights = weights.map(heightForWeight);
		for (let i = 1; i < heights.length; i++) {
			expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
		}
	});
});
