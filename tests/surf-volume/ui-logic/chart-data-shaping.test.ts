/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { buildHeatmapCells } from "../../../src/scripts/surf-volume/relative-heatmap";
import { makeObservation } from "../test-helpers";
import type { SourceMetadata } from "../../../src/lib/surf-volume/types";

function makeSource(source_id: string): SourceMetadata {
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
		automation_status: "not_attempted",
	};
}

describe("buildHeatmapCells", () => {
	it("computes percent deviation from each profile's own median, not a global median", () => {
		const observations = [
			makeObservation({ source_id: "a", weight_lb: 180, skill_normalized: "intermediate", recommended_volume_point_l: 40, profile_id: "core_w180_intermediate" }),
			makeObservation({ source_id: "b", weight_lb: 180, skill_normalized: "intermediate", recommended_volume_point_l: 60, profile_id: "core_w180_intermediate" }),
		];
		const cells = buildHeatmapCells(observations, [makeSource("a"), makeSource("b")]);

		expect(cells).toHaveLength(2);
		const median = 50;
		expect(cells.find((c) => c.source === "a")!.pct).toBeCloseTo((40 - median) / median, 5);
		expect(cells.find((c) => c.source === "b")!.pct).toBeCloseTo((60 - median) / median, 5);
	});

	it("ignores non-core (Dataset B/C) profiles entirely", () => {
		const observations = [
			makeObservation({ source_id: "a", weight_lb: 150, skill_normalized: "beginner", recommended_volume_point_l: 40, profile_id: "new_learner" }),
		];
		expect(buildHeatmapCells(observations, [makeSource("a")])).toHaveLength(0);
	});

	it("builds a compact weight·skill-initial profile label", () => {
		const observations = [makeObservation({ source_id: "a", weight_lb: 160, skill_normalized: "advanced", recommended_volume_point_l: 30, profile_id: "core_w160_advanced" })];
		const cells = buildHeatmapCells(observations, [makeSource("a")]);
		expect(cells[0].profile).toBe("160·A");
	});

	it("skips a profile entirely when its consensus is null (no comparable observations)", () => {
		const observations = [
			makeObservation({ source_id: "a", weight_lb: 180, skill_normalized: "intermediate", recommended_volume_point_l: null, profile_id: "core_w180_intermediate" }),
		];
		expect(buildHeatmapCells(observations, [makeSource("a")])).toHaveLength(0);
	});
});
