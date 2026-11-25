// What The Noise Problem's tare scale reads, day by day: the measured lift (B - A) and its 95%
// interval, raw and CUPED-adjusted, straight from one seeded run of the page's live experiment.
// Pure: no renderer, no DOM.
import { runCupedExperiment, type CupedExperimentConfig } from "./cuped-experiment";

export interface Reading {
	/** Measured lift, B's mean minus A's. */
	lift: number;
	/** 95% interval on the lift. */
	low: number;
	high: number;
	p: number;
}

export interface DayReading {
	day: number;
	/** Visitors in the experiment so far, both arms. */
	visitors: number;
	raw: Reading;
	cuped: Reading;
}

export interface ScaleReadings {
	config: CupedExperimentConfig;
	days: DayReading[];
	/** The lift the simulation actually applied to B. */
	trueLift: number;
	/** The dial runs from -dialMax to +dialMax points: wide enough for every interval, raw or CUPED. */
	dialMax: number;
	/** Minor ticks every tickStep points, numbers every labelStep. */
	tickStep: number;
	labelStep: number;
}

const LABEL_STEP = 4;

export function buildScaleReadings(config: CupedExperimentConfig): ScaleReadings {
	const result = runCupedExperiment(config);
	const reading = (lift: number, low: number | null, high: number | null, p: number | null, day: number): Reading => {
		if (low === null || high === null || p === null) throw new Error(`No interval on day ${day}`);
		return { lift, low, high, p };
	};
	const days = result.days.map((d) => ({
		day: d.day,
		visitors: 2 * config.visitors_per_day * d.day,
		raw: reading(d.raw_mean_b - d.raw_mean_a, d.raw_ci_low, d.raw_ci_high, d.raw_p_value, d.day),
		cuped: reading(d.cuped_mean_b - d.cuped_mean_a, d.cuped_ci_low, d.cuped_ci_high, d.cuped_p_value, d.day),
	}));
	const extent = Math.max(config.true_lift, ...days.flatMap((d) => [d.raw.low, d.raw.high, d.cuped.low, d.cuped.high].map(Math.abs)));
	return {
		config,
		days,
		trueLift: config.true_lift,
		dialMax: Math.ceil(extent / LABEL_STEP) * LABEL_STEP,
		tickStep: 1,
		labelStep: LABEL_STEP,
	};
}

/** Interval width, high - low. */
export const intervalWidth = (r: Reading) => r.high - r.low;

/** True when the 95% interval leaves out zero, i.e. p < 0.05 for the page's z-test. */
export const excludesZero = (r: Reading) => r.low > 0 || r.high < 0;
