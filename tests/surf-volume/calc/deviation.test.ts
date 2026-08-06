import { describe, expect, it } from "vitest";
import { computeComparison } from "../../../src/lib/surf-volume/compare";
import { makeObservation } from "../test-helpers";
import type { LiveProfile, SourceMetadata } from "../../../src/lib/surf-volume/types";

function makeSource(source_id: string, overrides: Partial<SourceMetadata> = {}): SourceMetadata {
	return {
		source_id,
		source_name: source_id,
		source_url: "https://example.com",
		source_type: "manufacturer",
		methodology_family: "test",
		input_count: 2,
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
		methodology_published: true,
		formula_published: true,
		assumptions_stated: true,
		outputs_reproducible: true,
		requires_login: false,
		automation_status: "automated",
		...overrides,
	};
}

describe("computeComparison", () => {
	const profile: LiveProfile = { weight_lb: 170, skill: "intermediate" };

	it("computes correct relative deviation for each system against the consensus", () => {
		const observations = [
			makeObservation({ source_id: "a", weight_lb: 170, skill_normalized: "intermediate", recommended_volume_point_l: 50 }),
			makeObservation({ source_id: "b", weight_lb: 170, skill_normalized: "intermediate", recommended_volume_point_l: 60 }),
			makeObservation({ source_id: "c", weight_lb: 170, skill_normalized: "intermediate", recommended_volume_point_l: 70 }),
		];
		const sources = [makeSource("a"), makeSource("b"), makeSource("c")];
		const result = computeComparison(profile, observations, sources);

		expect(result.consensus.median).toBe(60);
		const rowA = result.rows.find((r) => r.source_id === "a")!;
		const rowC = result.rows.find((r) => r.source_id === "c")!;
		expect(rowA.deviation_from_consensus_l).toBeCloseTo(-10, 5);
		expect(rowA.deviation_from_consensus_pct).toBeCloseTo(-10 / 60, 5);
		expect(rowC.deviation_from_consensus_l).toBeCloseTo(10, 5);
		expect(rowA.status).toBe("observed");
	});

	it("marks a source unavailable rather than fabricating a value when it has no comparable data", () => {
		const observations = [makeObservation({ source_id: "a", weight_lb: 170, skill_normalized: "intermediate", recommended_volume_point_l: 50 })];
		const sources = [makeSource("a"), makeSource("b")];
		const result = computeComparison(profile, observations, sources);

		const rowB = result.rows.find((r) => r.source_id === "b")!;
		expect(rowB.status).toBe("unavailable");
        expect(rowB.recommended_volume_point_l).toBeNull();
		expect(rowB.deviation_from_consensus_l).toBeNull();
	});

	it("labels an interpolated value distinctly from an exact observation", () => {
		const observations = [
			makeObservation({ source_id: "a", weight_lb: 160, skill_normalized: "intermediate", recommended_volume_point_l: 46 }),
			makeObservation({ source_id: "a", weight_lb: 180, skill_normalized: "intermediate", recommended_volume_point_l: 54 }),
		];
		const sources = [makeSource("a")];
		const result = computeComparison(profile, observations, sources);
		expect(result.rows[0].status).toBe("interpolated");
		expect(result.rows[0].recommended_volume_point_l).toBeCloseTo(50, 5);
	});

	it("labels a community heuristic distinctly even on an exact match", () => {
		const observations = [makeObservation({ source_id: "h", weight_lb: 170, skill_normalized: "intermediate", recommended_volume_point_l: 50 })];
		const sources = [makeSource("h", { source_type: "community_heuristic" })];
		const result = computeComparison(profile, observations, sources);
		expect(result.rows[0].status).toBe("community_heuristic");
	});

	it("returns insufficient_data consensus, never a bogus 0, when nothing is comparable", () => {
		const result = computeComparison(profile, [], [makeSource("a")]);
		expect(result.consensus.median).toBeNull();
		expect(result.consensus.n_contributing_systems).toBe(0);
	});
});
