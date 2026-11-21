// The runs behind The Peeking Problem's hero, the p-value coaster: the first trials of the page's
// own repeated-trials peeking study, replayed one at a time. Each run is a null experiment (both
// arms share one true rate), tested once a day on its cumulative data, exactly as the study does
// it, so the share of these runs that ever dips under alpha is the study's any-day rate measured
// on a small sample, and the study's full rate is reported beside it from the same seed.
import { peekingTrialConfig, runPeekingStudy } from "./peeking-study";
import { defaultPeekingStudyConfig } from "./peeking-study-defaults";
import { runSequentialExperiment } from "./sequential-experiment";
import type { PeekingStudyConfig } from "./types";

/** Seed of the first run; run i uses seed + i, the study's own per-trial rule. */
export const COASTER_SEED = 1;
export const COASTER_RUNS = 20;

export interface DayP {
	day: number;
	p: number;
}

export interface CoasterRun {
	/** 0-based position in the fixed list. */
	index: number;
	seed: number;
	/** The day-by-day p-value at each daily peek, day 1 first. */
	p: number[];
	/** The first peek with p < alpha: where stopping on a "winner" would have ended the test. Null if it never happens. */
	firstCrossing: DayP | null;
	/** Every peek where p dropped under alpha from at or above it the peek before (day 1 counts if it starts under). */
	dipDays: number[];
	/** The planned end: the only look a fixed-horizon test takes. */
	final: DayP;
	/** The lowest p-value of the run. */
	low: DayP;
}

export interface CoasterData {
	/** The page's study settings, which every run uses: `seed` is the first run's, `trials` the full study's. */
	config: PeekingStudyConfig;
	alpha: number;
	days: number;
	runs: CoasterRun[];
	/** Runs that dipped under alpha on at least one daily peek. */
	crossedCount: number;
	/** Runs under alpha on the final day only: the fixed-horizon false positives. */
	finalCount: number;
	/** How many runs had dipped under alpha by each day (index 0 is day 1). */
	crossedByDay: number[];
	/** The page's full study at the same settings and seed, so the small sample can be checked against it. */
	study: { trials: number; anyDayRate: number; finalDayRate: number };
}

/** Pure summary of one run's daily p-values against alpha. */
export function summarizeRun(index: number, seed: number, p: number[], alpha: number): CoasterRun {
	const dipDays: number[] = [];
	let firstCrossing: DayP | null = null;
	let low: DayP = { day: 1, p: p[0] };
	for (let i = 0; i < p.length; i++) {
		const day = i + 1;
		const under = p[i] < alpha;
		if (under && (i === 0 || p[i - 1] >= alpha)) dipDays.push(day);
		if (under && !firstCrossing) firstCrossing = { day, p: p[i] };
		if (p[i] < low.p) low = { day, p: p[i] };
	}
	return { index, seed, p, firstCrossing, dipDays, final: { day: p.length, p: p[p.length - 1] }, low };
}

export function buildCoasterData(opts: { seed?: number; runs?: number; studyTrials?: number } = {}): CoasterData {
	const seed = opts.seed ?? COASTER_SEED;
	const count = opts.runs ?? COASTER_RUNS;
	const config = defaultPeekingStudyConfig(seed, opts.studyTrials);
	const alpha = config.frequentist_alpha;

	const runs = Array.from({ length: count }, (_, i) => {
		const trial = peekingTrialConfig(config, i);
		const p = runSequentialExperiment(trial).days.map((d) => {
			if (d.p_value === null) throw new Error(`Run ${i + 1} (seed ${trial.seed}) has no p-value on day ${d.day}.`);
			return d.p_value;
		});
		return summarizeRun(i, trial.seed, p, alpha);
	});

	const crossedByDay = Array.from({ length: config.days }, (_, d) => runs.filter((r) => r.firstCrossing && r.firstCrossing.day <= d + 1).length);
	const study = runPeekingStudy(config);

	return {
		config,
		alpha,
		days: config.days,
		runs,
		crossedCount: runs.filter((r) => r.firstCrossing).length,
		finalCount: runs.filter((r) => r.final.p < alpha).length,
		crossedByDay,
		study: { trials: config.trials, anyDayRate: study.frequentist_any_day_rate, finalDayRate: study.frequentist_final_day_rate },
	};
}

let cached: CoasterData | null = null;
/** The published runs (seed 1, 20 runs, the full 500-trial study), computed once per build or dev server. */
export function publishedCoasterData(): CoasterData {
	cached ??= buildCoasterData();
	return cached;
}
