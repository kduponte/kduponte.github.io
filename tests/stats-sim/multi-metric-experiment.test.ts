import { describe, expect, it } from "vitest";
import { simulateMetricBatch } from "../../src/lib/stats-sim/multi-metric-experiment";

describe("simulateMetricBatch", () => {
	it("splits metrics into null/non-null according to fraction_null", () => {
		const outcomes = simulateMetricBatch({
			num_metrics: 20,
			fraction_null: 0.7,
			baseline_rate: 0.1,
			relative_lift: 0.5,
			visitors_per_arm: 500,
			seed: 1,
		});
		expect(outcomes.filter((o) => o.is_null).length).toBe(14);
		expect(outcomes.filter((o) => !o.is_null).length).toBe(6);
	});

	it("is deterministic for a fixed seed", () => {
		const config = { num_metrics: 10, fraction_null: 0.5, baseline_rate: 0.1, relative_lift: 0.5, visitors_per_arm: 300, seed: 7 };
		const a = simulateMetricBatch(config);
		const b = simulateMetricBatch(config);
		expect(a.map((o) => o.p_value)).toEqual(b.map((o) => o.p_value));
	});

	it("non-null metrics have smaller p-values on average than null metrics", () => {
		let nullPSum = 0;
		let nullCount = 0;
		let liftedPSum = 0;
		let liftedCount = 0;
		for (let seed = 0; seed < 300; seed++) {
			const outcomes = simulateMetricBatch({
				num_metrics: 10,
				fraction_null: 0.5,
				baseline_rate: 0.1,
				relative_lift: 0.6,
				visitors_per_arm: 400,
				seed,
			});
			for (const o of outcomes) {
				if (o.is_null) {
					nullPSum += o.p_value;
					nullCount++;
				} else {
					liftedPSum += o.p_value;
					liftedCount++;
				}
			}
		}
		expect(liftedPSum / liftedCount).toBeLessThan(nullPSum / nullCount);
	});
});
