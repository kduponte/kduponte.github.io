// The Noise Problem's live experiment starts from these settings, and the hero's glass cube draws
// the visitors of one seeded run at exactly the same settings, so the two can never drift apart.
import type { CupedExperimentConfig } from "./cuped-experiment";

/** The live experiment's opening settings (everything but the seed, which is random per run). */
export const LIVE_EXPERIMENT_DEFAULTS: Omit<CupedExperimentConfig, "seed"> = {
	true_lift: 4,
	y_mean: 100,
	y_sd: 20,
	correlation: 0.75,
	visitors_per_day: 30,
	days: 20,
};

/** The hero cube's run: the live experiment's defaults with a fixed seed, so anyone can rerun it. */
export const HERO_CUBE_SEED = 1;
