import { describe, expect, it } from "vitest";
import {
	complexityScore,
	consistencyScore,
	coverageScore,
	relativeVolumeTendencyScore,
	sensitivityScore,
	transparencyScore,
} from "../../../src/lib/surf-volume/scores";
import { makeObservation } from "../test-helpers";
import type { SourceMetadata } from "../../../src/lib/surf-volume/types";

function makeSource(overrides: Partial<SourceMetadata> & { source_id: string; input_count: number }): SourceMetadata {
	return {
		source_name: overrides.source_id,
		source_url: "https://example.com",
		source_type: "manufacturer",
		methodology_family: "test",
		supports_weight: true,
		supports_height: false,
		supports_age: false,
		supports_gender: false,
		supports_fitness: false,
		supports_frequency: false,
		supports_skill: true,
		supports_wave_type: false,
		supports_wave_size: false,
		supports_wetsuit: false,
		output_type: "point_liters",
		methodology_published: false,
		formula_published: false,
		assumptions_stated: false,
		outputs_reproducible: false,
		requires_login: false,
		automation_status: "not_attempted",
		...overrides,
	};
}

describe("transparencyScore", () => {
	it("is 1.0 when all 4 rubric factors are true", () => {
		const s = makeSource({
			source_id: "a",
			input_count: 2,
			methodology_published: true,
			formula_published: true,
			assumptions_stated: true,
			outputs_reproducible: true,
		});
		expect(transparencyScore(s)).toBe(1);
	});

	it("is 0.5 when 2 of 4 rubric factors are true", () => {
		const s = makeSource({ source_id: "a", input_count: 2, methodology_published: true, formula_published: true });
		expect(transparencyScore(s)).toBe(0.5);
	});
});

describe("coverageScore", () => {
	it("counts the fraction of true supports_* fields", () => {
		const s = makeSource({ source_id: "a", input_count: 2, supports_weight: true, supports_skill: true });
		expect(coverageScore(s)).toBeCloseTo(2 / 10, 5);
	});
});

describe("complexityScore", () => {
	it("min-max normalizes input_count across sources, 0 for simplest, 1 for richest", () => {
		const sources = [makeSource({ source_id: "a", input_count: 2 }), makeSource({ source_id: "b", input_count: 10 })];
		expect(complexityScore(sources, sources[0])).toBe(0);
		expect(complexityScore(sources, sources[1])).toBe(1);
	});

	it("returns 0.5 (not NaN) when all sources have identical input_count", () => {
		const sources = [makeSource({ source_id: "a", input_count: 4 }), makeSource({ source_id: "b", input_count: 4 })];
		expect(complexityScore(sources, sources[0])).toBe(0.5);
	});
});

describe("relativeVolumeTendencyScore", () => {
	it("is null (not 0) when a source has no comparable Dataset A observations", () => {
		expect(relativeVolumeTendencyScore("acme", [])).toBeNull();
	});

	it("is positive when a source consistently recommends more than the cross-system median", () => {
		const profileA = [
			makeObservation({ source_id: "acme", weight_lb: 160, skill_normalized: "beginner", recommended_volume_point_l: 60, profile_id: "core_w160_beginner" }),
			makeObservation({ source_id: "other", weight_lb: 160, skill_normalized: "beginner", recommended_volume_point_l: 50, profile_id: "core_w160_beginner" }),
		];
		const profileB = [
			makeObservation({ source_id: "acme", weight_lb: 180, skill_normalized: "beginner", recommended_volume_point_l: 66, profile_id: "core_w180_beginner" }),
			makeObservation({ source_id: "other", weight_lb: 180, skill_normalized: "beginner", recommended_volume_point_l: 55, profile_id: "core_w180_beginner" }),
		];
		const score = relativeVolumeTendencyScore("acme", [...profileA, ...profileB]);
		expect(score).toBeGreaterThan(0);
	});
});

describe("sensitivityScore", () => {
	it("is null when no variant observations exist for a source", () => {
		expect(sensitivityScore("acme", [])).toBeNull();
	});

	it("computes mean absolute percent change from archetype base", () => {
		const base = makeObservation({ source_id: "acme", weight_lb: 150, skill_normalized: "beginner", recommended_volume_point_l: 40, profile_id: "new_learner" });
		const variant = makeObservation({ source_id: "acme", weight_lb: 150, skill_normalized: "beginner", recommended_volume_point_l: 44, profile_id: "sens_new_learner_fitness_high" });
		expect(sensitivityScore("acme", [base, variant])).toBeCloseTo(0.1, 5);
	});
});

describe("consistencyScore", () => {
	it("scores 1.0 when volume is monotonically non-decreasing with weight", () => {
		const obs = [140, 160, 180, 200].map((weight_lb, i) =>
			makeObservation({ source_id: "acme", weight_lb, skill_normalized: "beginner", recommended_volume_point_l: 30 + i * 5, profile_id: `core_w${weight_lb}_beginner` }),
		);
		const { score, flags } = consistencyScore("acme", obs);
		expect(score).toBe(1);
		expect(flags).toEqual([]);
	});

	it("flags but does not zero-out an isolated outsized jump", () => {
		const obs = [140, 160, 180, 200].map((weight_lb, i) =>
			makeObservation({ source_id: "acme", weight_lb, skill_normalized: "beginner", recommended_volume_point_l: [30, 32, 60, 62][i], profile_id: `core_w${weight_lb}_beginner` }),
		);
		const { score, flags } = consistencyScore("acme", obs);
		expect(score).toBeGreaterThan(0);
		expect(flags.length).toBeGreaterThan(0);
	});

	it("returns null (not 0) when a source has no Dataset A data", () => {
		const { score } = consistencyScore("acme", []);
		expect(score).toBeNull();
	});
});
