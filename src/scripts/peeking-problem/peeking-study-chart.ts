// Repeated-trials Monte Carlo study: hundreds of independent null-true experiments, comparing how
// often each method declares a "winner" checking once at a fixed end vs. checking every day. The
// actual computation is synchronous and takes a noticeable fraction of a second, so it's deferred
// one tick behind a "Computing..." message so the browser gets to paint that state first.
import * as Plot from "@observablehq/plot";
import type { RectYOptions } from "@observablehq/plot";
import { runPeekingStudy } from "../../lib/stats-sim/peeking-study";
import type { MetricType, PeekingStudyResult } from "../../lib/stats-sim/types";
import { wireTableToggle } from "../shared/chart-utils";

const DEFAULT_REVENUE_SPEND_RATE = 0.01;
const DEFAULT_REVENUE_VISITORS_PER_DAY = 500_000;
const DEFAULT_REVENUE_AVG_SPEND = 50;
const DEFAULT_CONVERSION_BASELINE_RATE = 0.1;
const DEFAULT_CONVERSION_VISITORS_PER_DAY = 50;
const DAYS = 30;
const TRIALS = 500;
const FREQUENTIST_ALPHA = 0.05;
// Calibrated (not the more obvious 0.95) so the Bayesian rule's final-day-only rate lands near the
// same ~5% nominal rate as the frequentist test — without matching that baseline, the "any day vs.
// final day" comparison between the two methods wouldn't be apples-to-apples. See Methodology.
const BAYESIAN_THRESHOLD = 0.975;
const MC_SAMPLES = 200;

type Method = "Frequentist" | "Bayesian" | "Always-valid";
const METHOD_ORDER: Method[] = ["Frequentist", "Bayesian", "Always-valid"];

interface RateRow {
	method: Method;
	look: "Checked once (end)" | "Checked every day";
	rate: number;
}

function buildRateRows(result: PeekingStudyResult): RateRow[] {
	return [
		{ method: "Frequentist", look: "Checked once (end)", rate: result.frequentist_final_day_rate },
		{ method: "Frequentist", look: "Checked every day", rate: result.frequentist_any_day_rate },
		{ method: "Bayesian", look: "Checked once (end)", rate: result.bayesian_final_day_rate },
		{ method: "Bayesian", look: "Checked every day", rate: result.bayesian_any_day_rate },
		{ method: "Always-valid", look: "Checked once (end)", rate: result.always_valid_final_day_rate },
		{ method: "Always-valid", look: "Checked every day", rate: result.always_valid_any_day_rate },
	];
}

interface CrossingRow {
	method: Method;
	day: number;
}

function buildCrossingRows(result: PeekingStudyResult): CrossingRow[] {
	return [
		...result.first_crossing_days_frequentist.map((day): CrossingRow => ({ method: "Frequentist", day })),
		...result.first_crossing_days_bayesian.map((day): CrossingRow => ({ method: "Bayesian", day })),
		...result.first_crossing_days_always_valid.map((day): CrossingRow => ({ method: "Always-valid", day })),
	];
}

export function initPeekingStudy(controlsForm: HTMLFormElement, root: HTMLElement) {
	const metricTypeSelect = controlsForm.querySelector<HTMLSelectElement>("#pp-study-metric-type")!;
	const baselineRateInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-baseline-rate")!;
	const baselineLabel = controlsForm.querySelector<HTMLElement>("[data-pp-study-baseline-label]")!;
	const avgRevenueField = controlsForm.querySelector<HTMLElement>("#pp-study-avg-revenue-field")!;
	const avgRevenueInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-avg-revenue")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-visitors")!;
	const priorStrengthInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-prior-strength")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#pp-study-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	function applyMetricTypeDefaults() {
		const isRevenue = metricTypeSelect.value === "revenue";
		avgRevenueField.hidden = !isRevenue;
		baselineLabel.textContent = isRevenue ? "Spend rate (%)" : "Baseline rate (%)";
		baselineRateInput.value = String((isRevenue ? DEFAULT_REVENUE_SPEND_RATE : DEFAULT_CONVERSION_BASELINE_RATE) * 100);
		avgRevenueInput.value = String(DEFAULT_REVENUE_AVG_SPEND);
		visitorsInput.value = String(isRevenue ? DEFAULT_REVENUE_VISITORS_PER_DAY : DEFAULT_CONVERSION_VISITORS_PER_DAY);
	}
	metricTypeSelect.value = "revenue";
	applyMetricTypeDefaults();
	priorStrengthInput.value = "0";

	function renderRateChart(rows: RateRow[], width: number) {
		const plot = Plot.plot({
			width,
			height: 280,
			marginLeft: 48,
			facet: { data: rows, x: "method" },
			fx: { domain: METHOD_ORDER, label: null },
			x: { label: null },
			y: { label: "Rate a “winner” was declared", domain: [0, Math.max(0.4, ...rows.map((r) => r.rate) )], grid: true, tickFormat: (d: number) => `${(d * 100).toFixed(0)}%` },
			marks: [
				Plot.ruleY([FREQUENTIST_ALPHA], { stroke: "var(--color-ink-soft)", strokeDasharray: "3,3" }),
				Plot.barY(rows, {
					x: "look",
					y: "rate",
					fill: (d: RateRow) => (d.look === "Checked every day" ? "var(--color-accent-yellow)" : "var(--color-accent-blue)"),
					title: (d: RateRow) => `${d.method}, ${d.look}: ${(d.rate * 100).toFixed(1)}%`,
				}),
			],
		});
		return plot;
	}

	function renderHistogram(rows: CrossingRow[], width: number) {
		// Three separate, pre-filtered marks with fixed colors (rather than a data-driven fill
		// channel through Plot.binX) — each facet only ever contains one method's rows anyway,
		// since the chart is faceted by method, so a channel here would be redundant.
		const freqRows = rows.filter((r) => r.method === "Frequentist");
		const bayesRows = rows.filter((r) => r.method === "Bayesian");
		const alwaysValidRows = rows.filter((r) => r.method === "Always-valid");
		const plot = Plot.plot({
			width,
			height: 280,
			marginLeft: 40,
			facet: { data: rows, x: "method" },
			fx: { domain: METHOD_ORDER, label: null },
			x: { label: "Day of first false positive", domain: [1, DAYS] },
			y: { label: "Trials", grid: true },
			marks: [
				Plot.rectY(freqRows, Plot.binX<RectYOptions>({ y: "count" }, { x: "day", thresholds: DAYS, fill: "var(--color-accent-blue)" })),
				Plot.rectY(bayesRows, Plot.binX<RectYOptions>({ y: "count" }, { x: "day", thresholds: DAYS, fill: "var(--color-accent-green)" })),
				Plot.rectY(alwaysValidRows, Plot.binX<RectYOptions>({ y: "count" }, { x: "day", thresholds: DAYS, fill: "var(--color-ink)" })),
			],
		});
		return plot;
	}

	function renderTable(rows: RateRow[]) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Method</th><th class="py-2 pr-4">Looked</th><th class="py-2">Winner-declared rate</th>
			</tr></thead>
			<tbody>${rows
				.map(
					(r) => `<tr class="border-b border-line/60">
				<td class="py-2 pr-4">${r.method}</td>
				<td class="py-2 pr-4">${r.look}</td>
				<td class="py-2 font-mono">${(r.rate * 100).toFixed(1)}%</td>
			</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(result: PeekingStudyResult) {
		const freqMultiplier = result.frequentist_final_day_rate > 0 ? result.frequentist_any_day_rate / result.frequentist_final_day_rate : null;
		const bayesMultiplier = result.bayesian_final_day_rate > 0 ? result.bayesian_any_day_rate / result.bayesian_final_day_rate : null;
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${(result.always_valid_any_day_rate * 100).toFixed(1)}%</span>
			<span class="ml-2 text-sm text-ink-soft">of null-true experiments looked like an always-valid winner at some point, vs. ${(result.frequentist_any_day_rate * 100).toFixed(0)}% for the frequentist test (checking once: ${(result.frequentist_final_day_rate * 100).toFixed(0)}%${
				freqMultiplier ? `, a ${freqMultiplier.toFixed(1)}&times; inflation` : ""
			}) and ${(result.bayesian_any_day_rate * 100).toFixed(0)}% for the fixed Bayesian threshold (checking once: ${(result.bayesian_final_day_rate * 100).toFixed(0)}%${
				bayesMultiplier ? `, ${bayesMultiplier.toFixed(1)}&times;` : ""
			}) &middot; ${result.config.trials} simulated experiments at ${(result.config.true_rate * 100).toFixed(1)}% baseline, ${result.config.visitors_per_day.toLocaleString()}/day/arm
		`;
	}

	function runStudy() {
		runButton.disabled = true;
		summaryEl.textContent = "Computing... (a few hundred simulated experiments, checked every day)";
		chartEl.replaceChildren();
		// Deferred one tick so the "Computing..." message actually paints before the synchronous loop below runs.
		setTimeout(() => {
			const metricType = metricTypeSelect.value as MetricType;
			const defaultBaseline = metricType === "revenue" ? DEFAULT_REVENUE_SPEND_RATE : DEFAULT_CONVERSION_BASELINE_RATE;
			const defaultVisitors = metricType === "revenue" ? DEFAULT_REVENUE_VISITORS_PER_DAY : DEFAULT_CONVERSION_VISITORS_PER_DAY;
			const baselineRate = Math.min(0.5, Math.max(0.001, (Number(baselineRateInput.value) || defaultBaseline * 100) / 100));
			const visitorsPerDay = Math.min(500_000, Math.max(10, Math.round(Number(visitorsInput.value) || defaultVisitors)));
			const priorStrength = Math.min(1, Math.max(0, Number(priorStrengthInput.value) || 0));
			const avgRevenuePerSpender = Math.max(0.01, Number(avgRevenueInput.value) || DEFAULT_REVENUE_AVG_SPEND);
			const result = runPeekingStudy({
				true_rate: baselineRate,
				visitors_per_day: visitorsPerDay,
				days: DAYS,
				prior_strength: priorStrength,
				trials: TRIALS,
				seed: Math.floor(Math.random() * 1_000_000_000),
				frequentist_alpha: FREQUENTIST_ALPHA,
				bayesian_threshold: BAYESIAN_THRESHOLD,
				mc_samples: MC_SAMPLES,
				metric_type: metricType,
				avg_revenue_per_spender: metricType === "revenue" ? avgRevenuePerSpender : undefined,
			});
			const rateRows = buildRateRows(result);

			// Wrappers (label only) are inserted and measured before the plots are built, so each
			// chart renders at its ACTUAL post-layout column width (one column below md, two at/above
			// it) rather than assuming two columns and wasting space when the grid has stacked to one.
			const rateWrap = document.createElement("div");
			rateWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">False-positive rate under the null</p>';
			const histogramWrap = document.createElement("div");
			histogramWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">When do false positives happen?</p>';
			chartEl.replaceChildren(rateWrap, histogramWrap);

			const panelWidth = rateWrap.clientWidth || 300;
			rateWrap.appendChild(renderRateChart(rateRows, panelWidth));
			histogramWrap.appendChild(renderHistogram(buildCrossingRows(result), panelWidth));

			renderTable(rateRows);
			renderSummary(result);
			runButton.disabled = false;
		}, 10);
	}

	baselineRateInput.addEventListener("change", runStudy);
	avgRevenueInput.addEventListener("change", runStudy);
	visitorsInput.addEventListener("change", runStudy);
	priorStrengthInput.addEventListener("change", runStudy);
	metricTypeSelect.addEventListener("change", () => {
		applyMetricTypeDefaults();
		runStudy();
	});
	runButton.addEventListener("click", runStudy);

	runStudy();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#pp-study-controls");
	const root = document.querySelector<HTMLElement>("#pp-peeking-study");
	if (controlsForm && root) initPeekingStudy(controlsForm, root);
});
