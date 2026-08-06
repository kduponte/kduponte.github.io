import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeConsensus } from "../../../src/lib/surf-volume/consensus";
import type { Observation } from "../../../src/lib/surf-volume/types";

const PROCESSED_DIR = path.resolve(import.meta.dirname, "../../../data/surf-volume/processed");
const observations: Observation[] = JSON.parse(readFileSync(path.join(PROCESSED_DIR, "calculator_observations.json"), "utf-8"));

describe("comparability rules applied to the real dataset", () => {
	it("consensus for a core profile only draws from is_directly_comparable=true observations", () => {
		const profileObs = observations.filter((o) => o.profile_id === "core_w180_intermediate");
		const comparable = profileObs.filter((o) => o.is_directly_comparable && o.recommended_volume_point_l !== null);
		const excluded = profileObs.filter((o) => !o.is_directly_comparable);

		expect(comparable.length).toBeGreaterThan(0);
		expect(comparable.length + excluded.length).toBe(profileObs.length);

		const consensus = computeConsensus(comparable.map((o) => o.recommended_volume_point_l as number));
		expect(consensus.n_contributing_systems).toBe(comparable.length);
		// Sanity: an excluded source's value should not silently change the count.
		expect(consensus.n_contributing_systems).toBeLessThan(profileObs.length + 1);
	});

	it("Roberts and the future Guild Factor heuristic share methodology_family for overlap disclosure", () => {
		const roberts = observations.find((o) => o.source_id === "roberts");
		expect(roberts?.methodology_family).toBe("guild_factor");
	});
});
