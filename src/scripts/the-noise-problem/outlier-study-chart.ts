// Repeated-trials study: runs runOutlierStudy hundreds of times per click and renders the results
// as a pair of bar charts plus an accessible table.
//
// What each panel shows depends on the scenario, because the question does. With no real
// difference, every detection is a false positive, so the first panel is a false-positive rate and
// the second shows how far each method's own error bars understate its uncertainty (the mechanism
// behind any inflation). With a real lift, the first panel is the share of experiments that caught
// it and the second is how much of the true lift each method's estimate kept.
import * as Plot from "@observablehq/plot";
import { type OutlierAdjustment, type OutlierLiftMode } from "../../lib/stats-sim/outlier-handling-experiment";
import { runOutlierStudy, type OutlierStudyResult } from "../../lib/stats-sim/outlier-handling-study";
import { muFromMeanRevenue } from "../../lib/stats-sim/revenue";
import { wireTableToggle } from "../shared/chart-utils";
import { METHOD_COLOR, METHODS, REFERENCE_INK, type Method } from "./outlier-palette";

const TRIALS = 300;
const SPEND_RATE = 0.3;
const SIGMA = 1.2;
const MU = muFromMeanRevenue(60, SIGMA);
const ALPHA = 0.05;


/** Above this, a method's error bars are noticeably too narrow; the 1.1 cut keeps ordinary
 * trial-to-trial noise in a 300-trial run from being flagged. */
const CALIBRATION_FLAG = 1.1;

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

function methodRows(result: OutlierStudyResult) {
	const key: Record<Method, "raw" | "pooled" | "stratified"> = {
		Raw: "raw",
		"Pooled threshold": "pooled",
		"Stratified threshold": "stratified",
	};
	return METHODS.map((method) => {
		const k = key[method];
		const lift = result[`${k}_avg_estimated_lift`];
		return {
			method,
			rate: result[`${k}_final_day_detection_rate`],
			lift,
			capture: result.true_dollar_lift > 0 ? lift / result.true_dollar_lift : null,
			calibration: result[`${k}_se_calibration`],
		};
	});
}

export function initOutlierStudy(controlsForm: HTMLFormElement, root: HTMLElement) {
	const adjustmentSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-study-adjustment")!;
	const percentileSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-study-percentile")!;
	const scenarioSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-study-scenario")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#oh-study-lift")!;
	const whaleFractionWrap = controlsForm.querySelector<HTMLElement>("#oh-study-whale-fraction-wrap")!;
	const whaleFractionSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-study-whale-fraction")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#oh-study-visitors")!;
	const daysInput = controlsForm.querySelector<HTMLInputElement>("#oh-study-days")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#oh-study-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	adjustmentSelect.value = "winsorize";
	percentileSelect.value = "0.99";
	scenarioSelect.value = "tail_concentrated";
	liftInput.value = "30";
	whaleFractionSelect.value = "0.05";
	visitorsInput.value = "50";
	daysInput.value = "20";

	function syncControlVisibility() {
		const scenario = scenarioSelect.value as OutlierLiftMode;
		liftInput.disabled = scenario === "none";
		whaleFractionWrap.style.display = scenario === "tail_concentrated" ? "" : "none";
	}
	syncControlVisibility();

	const SHORT: Record<Method, string> = { Raw: "Raw", "Pooled threshold": "Pooled", "Stratified threshold": "Stratified" };

	function barPanel(
		title: string,
		note: string,
		rows: { method: Method; value: number }[],
		opts: { domain: [number, number]; format: (v: number) => string; tickFormat: (v: number) => string; reference: number; width: number },
	) {
		// The reference line is explained in a caption rather than labelled inside the plot: any bar
		// can reach the line, so no in-plot position is safe from colliding with a value label.
		const wrap = document.createElement("div");
		wrap.innerHTML = `<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">${title}</p><p class="mt-1 text-xs text-ink-soft">${note}</p>`;
		wrap.appendChild(
			Plot.plot({
				width: opts.width,
				height: 260,
				marginLeft: 44,
				marginTop: 22,
				x: { label: null, domain: METHODS, padding: 0.3, tickFormat: (m: Method) => SHORT[m] },
				y: { label: null, domain: opts.domain, grid: true, tickFormat: opts.tickFormat },
				marks: [
					Plot.barY(rows, { x: "method", y: "value", fill: (d: { method: Method }) => METHOD_COLOR[d.method], rx: 3, insetLeft: 1, insetRight: 1 }),
					Plot.ruleY([opts.reference], { stroke: REFERENCE_INK, strokeDasharray: "4,3" }),
					Plot.text(rows, { x: "method", y: "value", text: (d: { value: number }) => opts.format(d.value), dy: -9, fill: "#17140f", fontSize: 11 }),
					Plot.tip(rows, Plot.pointerX({ x: "method", y: "value", title: (d: { method: Method; value: number }) => `${d.method}: ${opts.format(d.value)}` })),
				],
			}),
		);
		return wrap;
	}

	function renderCharts(result: OutlierStudyResult, liftMode: OutlierLiftMode) {
		const rows = methodRows(result);
		const probe = document.createElement("div");
		chartEl.replaceChildren(probe);
		const width = probe.clientWidth || 400;
		const nullCase = liftMode === "none";

		const rateMax = Math.min(1, Math.max(nullCase ? 0.2 : 0.5, ...rows.map((r) => r.rate)) * 1.2);
		const wholePct = (v: number) => `${Math.round(v * 100)}%`;
		const ratePanel = barPanel(
			nullCase ? "False-positive rate (there is no real difference)" : "Share of experiments that detected the lift",
			nullCase ? "Dashed line: 5%, what a fair test produces when nothing changed." : "Dashed line: the 5% significance level.",
			rows.map((r) => ({ method: r.method, value: r.rate })),
			{ domain: [0, rateMax], format: (v) => pct(v), tickFormat: wholePct, reference: ALPHA, width },
		);

		let second: HTMLElement;
		if (nullCase) {
			const cal = rows.map((r) => ({ method: r.method, value: r.calibration ?? 1 }));
			const calMax = Math.max(1.4, ...cal.map((c) => c.value)) * 1.15;
			second = barPanel(
				"How much the real spread exceeds each test's error bars",
				"Dashed line: 1×, error bars that match how much the estimate really varies.",
				cal,
				{ domain: [0, calMax], format: (v) => `${v.toFixed(2)}×`, tickFormat: (v) => `${v.toFixed(1)}×`, reference: 1, width },
			);
		} else {
			const cap = rows.map((r) => ({ method: r.method, value: r.capture ?? 0 }));
			second = barPanel(
				"Share of the true lift each estimate kept",
				"Dashed line: 100%, an unbiased estimate.",
				cap,
				{ domain: [0, Math.max(1.25, ...cap.map((c) => c.value)) * 1.1], format: (v) => pct(v, 0), tickFormat: wholePct, reference: 1, width },
			);
		}
		chartEl.replaceChildren(ratePanel, second);
	}

	function renderTable(result: OutlierStudyResult, liftMode: OutlierLiftMode) {
		const rows = methodRows(result);
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Method</th><th class="py-2 pr-4">${liftMode === "none" ? "False-positive rate" : "Detection rate"}</th><th class="py-2 pr-4">Average estimated lift</th><th class="py-2 pr-4">Share of true lift</th><th class="py-2">Real spread ÷ reported error</th>
			</tr></thead>
			<tbody>${rows
				.map(
					(r) => `<tr class="border-b border-line/60">
					<td class="py-2 pr-4">${r.method}</td>
					<td class="py-2 pr-4 font-mono">${pct(r.rate)}</td>
					<td class="py-2 pr-4 font-mono">$${r.lift.toFixed(2)} <span class="text-ink-soft">of $${result.true_dollar_lift.toFixed(2)}</span></td>
					<td class="py-2 pr-4 font-mono">${r.capture === null ? "—" : pct(r.capture, 0)}</td>
					<td class="py-2 font-mono">${r.calibration === null ? "—" : `${r.calibration.toFixed(2)}×`}</td>
				</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(result: OutlierStudyResult, liftMode: OutlierLiftMode, percentile: number) {
		const rows = methodRows(result);
		const [raw, pooled, stratified] = rows;
		const strat = stratified.calibration;
		const flagged = strat !== null && strat > CALIBRATION_FLAG;
		const context = `${TRIALS} simulated experiments at the ${Math.round(percentile * 1000) / 10}th percentile. Each run draws fresh noise, so expect a point or two of variation.`;
		const headline =
			liftMode === "none"
				? `False positives: raw ${pct(raw.rate)}, pooled ${pct(pooled.rate)}, stratified ${pct(stratified.rate)}. A fair test lands near 5%.`
				: `Detected the lift: raw ${pct(raw.rate)}, pooled ${pct(pooled.rate)}, stratified ${pct(stratified.rate)}. Raw kept ${pct(raw.capture ?? 0, 0)} of the true lift, pooled ${pct(pooled.capture ?? 0, 0)}, stratified ${pct(stratified.capture ?? 0, 0)}.`;
		const warning = flagged
			? `<p class="mt-2 text-sm text-ink">Stratified's own error bars are ${(strat as number).toFixed(2)}× too narrow, so ${liftMode === "none" ? "its false-positive rate is inflated" : "part of its detection rate is false-positive inflation, not extra power"}.</p>`
			: "";
		summaryEl.innerHTML = `<div class="font-sans"><p class="text-sm text-ink">${headline}</p>${warning}<p class="mt-2 text-xs text-ink-soft">${context}</p></div>`;
	}

	function runStudy() {
		syncControlVisibility();
		const adjustment = adjustmentSelect.value as OutlierAdjustment;
		const upperPercentile = Math.min(0.999, Math.max(0.5, Number(percentileSelect.value) || 0.99));
		const liftMode = scenarioSelect.value as OutlierLiftMode;
		const trueRelativeLift = liftMode === "none" ? 0 : Math.max(0, Number(liftInput.value) || 0) / 100;
		const whaleFraction = Math.min(0.5, Math.max(0.001, Number(whaleFractionSelect.value) || 0.05));
		const visitorsPerDay = Math.min(500, Math.max(5, Math.round(Number(visitorsInput.value) || 50)));
		const days = Math.min(60, Math.max(5, Math.round(Number(daysInput.value) || 20)));

		const result = runOutlierStudy({
			trials: TRIALS,
			spend_rate: SPEND_RATE,
			mu: MU,
			sigma: SIGMA,
			lift_mode: liftMode,
			true_relative_lift: trueRelativeLift,
			whale_fraction: whaleFraction,
			adjustment,
			upper_percentile: upperPercentile,
			visitors_per_day: visitorsPerDay,
			days,
			alpha: ALPHA,
			seed: Math.floor(Math.random() * 1_000_000_000),
		});

		renderCharts(result, liftMode);
		renderTable(result, liftMode);
		renderSummary(result, liftMode, upperPercentile);
	}

	adjustmentSelect.addEventListener("change", runStudy);
	percentileSelect.addEventListener("change", runStudy);
	liftInput.addEventListener("input", runStudy);
	whaleFractionSelect.addEventListener("change", runStudy);
	visitorsInput.addEventListener("input", runStudy);
	daysInput.addEventListener("input", runStudy);
	scenarioSelect.addEventListener("change", runStudy);
	runButton.addEventListener("click", runStudy);

	runStudy();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#oh-study-controls");
	const root = document.querySelector<HTMLElement>("#oh-speed-study");
	if (controlsForm && root) initOutlierStudy(controlsForm, root);
});
