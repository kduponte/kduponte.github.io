// Every visitor of one simulated CUPED experiment: the balls in The Noise Problem's tare-scale
// bowl. Pure: no renderer, no DOM.
//
// The visitors are drawn exactly as runCupedExperiment draws them (same seed, same generator, same
// order: each day, visitor i of arm A then visitor i of arm B), so they ARE that experiment's data,
// not a look-alike; tests/stats-sim/cuped-visitors.test.ts checks them against the experiment's own
// day-by-day means.
import { simulateCorrelatedPair } from "./cuped";
import type { CupedExperimentConfig } from "./cuped-experiment";
import { mulberry32 } from "./rng";

export type Arm = "A" | "B";

export interface CupedVisitor {
	/** 1-based day the visitor arrived. */
	day: number;
	/** A is control, B is treatment (B's post-period mean carries the true lift). */
	arm: Arm;
	/** Pre-period value, the covariate (standard-normal units, as the simulation draws it). */
	x: number;
	/** Post-period value, the outcome metric. */
	y: number;
}

/** Every visitor runCupedExperiment would generate for this config, in its draw order. */
export function simulateCupedVisitors(config: CupedExperimentConfig): CupedVisitor[] {
	const rng = mulberry32(config.seed);
	const visitors: CupedVisitor[] = [];
	for (let day = 1; day <= config.days; day++) {
		for (let i = 0; i < config.visitors_per_day; i++) {
			const a = simulateCorrelatedPair(config.y_mean, config.y_sd, config.correlation, rng);
			const b = simulateCorrelatedPair(config.y_mean + config.true_lift, config.y_sd, config.correlation, rng);
			visitors.push({ day, arm: "A", ...a }, { day, arm: "B", ...b });
		}
	}
	return visitors;
}
