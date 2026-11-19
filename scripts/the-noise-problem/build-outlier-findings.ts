// Regenerates every outlier-handling figure the page quotes, from a fixed and documented
// configuration, and freezes them to JSON for the page to read at build time.
//
// The figures used to be typed into the page by hand from a one-off run whose seed and trial count
// nobody recorded, so nobody could reproduce them. Now each comes from runOutlierStudy (tested)
// with the same parameters as the study section's own defaults, more trials than the interactive
// version runs, and a fixed seed, and every rate carries a Wilson 95% interval.
//
// Run: npx tsx scripts/the-noise-problem/build-outlier-findings.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { wilsonInterval } from "../../src/lib/stats-sim/descriptive";
import { impliedFalsePositiveRate, runOutlierStudy, type OutlierStudyConfig } from "../../src/lib/stats-sim/outlier-handling-study";
import { muFromMeanRevenue } from "../../src/lib/stats-sim/revenue";

const OUT = "public/data/the-noise-problem/outlier-findings.json";
const TRIALS = 2000;
const SEED = 20260828;

// Identical to the study section's defaults (src/scripts/the-noise-problem/outlier-study-chart.ts),
// so a reader pressing "Run study" sees the same experiment, just with fewer trials and fresh noise.
const SIGMA = 1.2;
const BASE: OutlierStudyConfig = {
	trials: TRIALS,
	spend_rate: 0.3,
	mu: muFromMeanRevenue(60, SIGMA),
	sigma: SIGMA,
	lift_mode: "none",
	true_relative_lift: 0,
	whale_fraction: 0.05,
	adjustment: "winsorize",
	upper_percentile: 0.99,
	visitors_per_day: 50,
	days: 20,
	alpha: 0.05,
	seed: SEED,
};

const SCENARIOS: Record<string, Partial<OutlierStudyConfig>> = {
	null_99: {},
	null_90: { upper_percentile: 0.9 },
	null_99_trim: { adjustment: "trim" },
	null_99_5x_traffic: { visitors_per_day: 250 },
	uniform_99: { lift_mode: "uniform", true_relative_lift: 0.3 },
	tail_99: { lift_mode: "tail_concentrated", true_relative_lift: 0.3 },
};

const METHODS = ["raw", "pooled", "stratified"] as const;
const round = (x: number | null, d = 4) => (x === null ? null : Number(x.toFixed(d)));

function main(): void {
	const scenarios: Record<string, unknown> = {};
	for (const [name, overrides] of Object.entries(SCENARIOS)) {
		const config = { ...BASE, ...overrides };
		const started = Date.now();
		const r = runOutlierStudy(config);
		const methods = Object.fromEntries(
			METHODS.map((m) => {
				const rate = r[`${m}_final_day_detection_rate`];
				const ci = wilsonInterval(Math.round(rate * config.trials), config.trials);
				const avgLift = r[`${m}_avg_estimated_lift`];
				return [
					m,
					{
						final_day_detection_rate: round(rate),
						ci_low: round(ci.low),
						ci_high: round(ci.high),
						avg_estimated_lift: round(avgLift, 3),
						lift_capture: r.true_dollar_lift > 0 ? round(avgLift / r.true_dollar_lift) : null,
						se_calibration: round(r[`${m}_se_calibration`], 3),
						// Only meaningful under a true null, where every rejection is a false positive.
						implied_false_positive_rate:
							config.lift_mode === "none" && r[`${m}_se_calibration`] !== null
								? round(impliedFalsePositiveRate(r[`${m}_se_calibration`] as number, config.alpha))
								: null,
					},
				];
			}),
		);
		scenarios[name] = {
			config: {
				adjustment: config.adjustment,
				upper_percentile: config.upper_percentile,
				lift_mode: config.lift_mode,
				true_relative_lift: config.true_relative_lift,
				whale_fraction: config.whale_fraction,
				visitors_per_day: config.visitors_per_day,
				days: config.days,
				trials: config.trials,
			},
			true_dollar_lift: round(r.true_dollar_lift, 3),
			methods,
		};
		const line = METHODS.map((m) => {
			const x = (methods as Record<string, { final_day_detection_rate: number; lift_capture: number | null; se_calibration: number | null }>)[m];
			return `${m} ${(x.final_day_detection_rate * 100).toFixed(1)}%${x.lift_capture === null ? "" : ` capture ${(x.lift_capture * 100).toFixed(1)}%`} se×${x.se_calibration}`;
		}).join(" | ");
		console.log(`${name.padEnd(20)} ${line}   (${((Date.now() - started) / 1000).toFixed(0)}s)`);
	}

	mkdirSync("public/data/the-noise-problem", { recursive: true });
	writeFileSync(
		OUT,
		`${JSON.stringify(
			{
				generated_at: new Date().toISOString(),
				seed: SEED,
				trials: TRIALS,
				base: { spend_rate: BASE.spend_rate, mean_per_spender: 60, sigma: SIGMA, alpha: BASE.alpha },
				scenarios,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`\nWrote ${OUT}`);
}

main();
