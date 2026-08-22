// Simulates a batch of N metrics tested at once in a single "experiment", a realistic dashboard:
// some metrics are genuinely null (no real difference), some have a genuine lift, each gets its own
// two-proportion z-test on real simulated binomial data, reusing the exact same primitives the
// single-metric projects in this series already use.
import { twoProportionZTest } from "./frequentist";
import { binomial, mulberry32 } from "./rng";

export interface MultiMetricBatchConfig {
	num_metrics: number;
	fraction_null: number; // e.g. 0.7 => 70% of metrics are true nulls, the rest have a genuine lift
	baseline_rate: number;
	relative_lift: number; // applied to arm B's rate for the non-null metrics only
	visitors_per_arm: number;
	seed: number;
}

export interface MetricOutcome {
	metric_index: number;
	is_null: boolean;
	rate_a: number;
	rate_b: number;
	p_value: number;
}

export function simulateMetricBatch(config: MultiMetricBatchConfig): MetricOutcome[] {
	const rng = mulberry32(config.seed);
	const numNull = Math.round(config.num_metrics * config.fraction_null);
	const outcomes: MetricOutcome[] = [];

	for (let i = 0; i < config.num_metrics; i++) {
		const isNull = i < numNull;
		const rateA = config.baseline_rate;
		const rateB = isNull ? config.baseline_rate : Math.min(0.99, config.baseline_rate * (1 + config.relative_lift));
		const successesA = binomial(config.visitors_per_arm, rateA, rng);
		const successesB = binomial(config.visitors_per_arm, rateB, rng);
		const test = twoProportionZTest(successesA, config.visitors_per_arm, successesB, config.visitors_per_arm);
		outcomes.push({
			metric_index: i,
			is_null: isNull,
			rate_a: test.rate_a,
			rate_b: test.rate_b,
			p_value: test.p_value ?? 1,
		});
	}

	return outcomes;
}
