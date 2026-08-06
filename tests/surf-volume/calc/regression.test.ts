import { describe, expect, it } from "vitest";
import { buildDesignMatrix, fitRegression, type RegressionRow } from "../../../src/lib/surf-volume/regression";
import { makeObservation } from "../test-helpers";
import type { Skill } from "../../../src/lib/surf-volume/types";

const SKILLS: Skill[] = ["beginner", "intermediate", "advanced"];
const SKILL_EFFECT: Record<Skill, number> = { beginner: 0, intermediate: 4, advanced: 8 };
const SOURCE_EFFECT: Record<string, number> = { source_a: 0, source_b: -2 };
const TRUE_INTERCEPT = 30;
const TRUE_WEIGHT_COEF = 0.5;

function syntheticRows(): RegressionRow[] {
	const rows: RegressionRow[] = [];
	for (const source_id of Object.keys(SOURCE_EFFECT)) {
		for (const skill_normalized of SKILLS) {
			for (const weight_kg of [55, 65, 75, 85, 95, 105]) {
				const y =
					TRUE_INTERCEPT +
					TRUE_WEIGHT_COEF * (weight_kg - 80) +
					SKILL_EFFECT[skill_normalized] +
					SOURCE_EFFECT[source_id];
				rows.push({ weight_kg, skill_normalized, source_id, recommended_volume_point_l: y });
			}
		}
	}
	return rows;
}

describe("buildDesignMatrix", () => {
	it("produces one row per observation and the expected term names", () => {
		const rows = syntheticRows();
		const { X, terms } = buildDesignMatrix(rows, ["source_a", "source_b"], "source_a");
		expect(X).toHaveLength(rows.length);
		expect(terms).toEqual([
			"intercept",
			"weight_kg_centered",
			"skill_intermediate",
			"skill_advanced",
			"weight_kg_centered:skill_intermediate",
			"weight_kg_centered:skill_advanced",
			"source_source_b",
		]);
	});
});

describe("fitRegression coefficient recovery", () => {
	it("recovers known synthetic coefficients within tolerance and fits near-perfectly (noiseless data)", () => {
		const observations = syntheticRows().map((r, i) =>
			makeObservation({
				source_id: r.source_id,
				weight_lb: Math.round(r.weight_kg / 0.45359237),
				skill_normalized: r.skill_normalized,
				recommended_volume_point_l: r.recommended_volume_point_l,
				profile_id: `core_w${i}_${r.skill_normalized}`,
			}),
		);
		// Overwrite weight_kg exactly (rounding weight_lb above would otherwise drift it slightly).
		observations.forEach((o, i) => {
			o.weight_kg = syntheticRows()[i].weight_kg;
		});

		const result = fitRegression(observations, "source_a", 200, 1);

		const byTerm = Object.fromEntries(result.coefficients.map((c) => [c.term, c.estimate]));
		expect(byTerm["intercept"]).toBeCloseTo(TRUE_INTERCEPT, 1);
		expect(byTerm["weight_kg_centered"]).toBeCloseTo(TRUE_WEIGHT_COEF, 1);
		expect(byTerm["skill_intermediate"]).toBeCloseTo(SKILL_EFFECT.intermediate, 1);
		expect(byTerm["skill_advanced"]).toBeCloseTo(SKILL_EFFECT.advanced, 1);
		expect(byTerm["source_source_b"]).toBeCloseTo(SOURCE_EFFECT.source_b, 1);
		expect(result.r_squared).toBeGreaterThan(0.99);
		expect(result.n_observations).toBe(observations.length);
	});

	it("returns an empty, non-throwing result when there is no comparable data", () => {
		const result = fitRegression([], "source_a");
		expect(result.n_observations).toBe(0);
		expect(result.coefficients).toEqual([]);
		expect(result.notes.length).toBeGreaterThan(0);
	});
});
