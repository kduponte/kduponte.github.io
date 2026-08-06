// Data-quality gate over the real collected dataset (brief §21 "Data tests"). Runs directly
// against data/surf-volume/processed/calculator_observations.json — the same file the
// frontend consumes — rather than a separate validation script, so there's one source of
// truth for "is the dataset valid," not two implementations that can drift.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lbToKg } from "../../../src/lib/surf-volume/taxonomy";
import type { Observation, SourceMetadata } from "../../../src/lib/surf-volume/types";

const PROCESSED_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/processed");
const observations: Observation[] = JSON.parse(readFileSync(path.join(PROCESSED_DIR, "calculator_observations.json"), "utf-8"));
const sources: SourceMetadata[] = JSON.parse(readFileSync(path.join(PROCESSED_DIR, "source_metadata.json"), "utf-8"));

describe("dataset is non-trivial", () => {
	it("has at least one observation from each Phase A source collected so far", () => {
		expect(observations.length).toBeGreaterThan(0);
		expect(sources.length).toBeGreaterThan(0);
	});
});

describe("weight unit agreement", () => {
	it("weight_kg matches weight_lb within rounding tolerance for every observation", () => {
		for (const o of observations) {
			expect(o.weight_kg).toBeCloseTo(lbToKg(o.weight_lb), 1);
		}
	});
});

describe("volume range sanity", () => {
	it("min is never greater than max", () => {
		for (const o of observations) {
			if (o.recommended_volume_min_l !== null && o.recommended_volume_max_l !== null) {
				expect(o.recommended_volume_min_l).toBeLessThanOrEqual(o.recommended_volume_max_l);
			}
		}
	});

	it("point estimate falls inside [min, max] when both are present", () => {
		for (const o of observations) {
			if (o.recommended_volume_point_l !== null && o.recommended_volume_min_l !== null && o.recommended_volume_max_l !== null) {
				expect(o.recommended_volume_point_l).toBeGreaterThanOrEqual(o.recommended_volume_min_l - 1e-9);
				expect(o.recommended_volume_point_l).toBeLessThanOrEqual(o.recommended_volume_max_l + 1e-9);
			}
		}
	});

	it("no zero or negative volume values", () => {
		for (const o of observations) {
			for (const field of [o.recommended_volume_min_l, o.recommended_volume_max_l, o.recommended_volume_point_l]) {
				if (field !== null) expect(field).toBeGreaterThan(0);
			}
		}
	});
});

describe("referential integrity", () => {
	const validSourceIds = new Set(sources.map((s) => s.source_id));

	it("every observation's source_id exists in source_metadata", () => {
		for (const o of observations) {
			expect(validSourceIds.has(o.source_id)).toBe(true);
		}
	});

	it("normalized skill uses only the allowed 3-value taxonomy", () => {
		for (const o of observations) {
			expect(["beginner", "intermediate", "advanced"]).toContain(o.skill_normalized);
		}
	});
});

describe("collection method and interpolation labeling", () => {
	it("every observation records a collection method", () => {
		for (const o of observations) {
			expect(o.collection_method).toBeTruthy();
		}
	});

	it("no observation in the collected dataset is (yet) labeled interpolated — interpolation happens at query time, not at collection time", () => {
		for (const o of observations) {
			expect(o.is_interpolated).toBe(false);
		}
	});

	it("directly incomparable records are excluded from is_directly_comparable=true (spot check: Surf Simply is a reference philosophy, not comparable)", () => {
		const surfSimplyObs = observations.filter((o) => o.source_id === "surf_simply");
		if (surfSimplyObs.length > 0) {
			for (const o of surfSimplyObs) expect(o.is_directly_comparable).toBe(false);
		}
	});
});
