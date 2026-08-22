// Repeated-trials speed study: runs runCupedStudy hundreds of times per click and renders the two
// deliberately separate results (final-day detection rate, and days-to-first-detection) as a bar
// chart and a histogram, plus an accessible summary table.
import * as Plot from "@observablehq/plot";
import type { RectYOptions } from "@observablehq/plot";
import { runCupedStudy, type CupedStudyResult } from "../../lib/stats-sim/cuped-study";
import { wireTableToggle } from "../shared/chart-utils";

const TRIALS = 300;
const Y_MEAN = 100;
const Y_SD = 20;
const ALPHA = 0.05;

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

export function initSpeedStudy(controlsForm: HTMLFormElement, root: HTMLElement) {
	const correlationInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-correlation")!;
	const correlationValue = controlsForm.querySelector<HTMLElement>("#pp-study-correlation-value")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-lift")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-visitors")!;
	const daysInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-days")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#pp-study-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	correlationInput.value = "0.85";
	liftInput.value = "4";
	visitorsInput.value = "30";
	daysInput.value = "10";

	function renderCharts(result: CupedStudyResult, days: number) {
		const rateWrap = document.createElement("div");
		rateWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Final-day detection rate</p>';
		const histWrap = document.createElement("div");
		histWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Day of first detection</p>';
		chartEl.replaceChildren(rateWrap, histWrap);
		const panelWidth = rateWrap.clientWidth || 400;

		const rateRows = [
			{ method: "Raw", rate: result.raw_final_day_detection_rate },
			{ method: "CUPED-adjusted", rate: result.cuped_final_day_detection_rate },
		];
		const ratePlot = Plot.plot({
			width: panelWidth,
			height: 280,
			marginLeft: 48,
			x: { label: null, domain: ["Raw", "CUPED-adjusted"] },
			y: { label: "Detection rate", domain: [0, 1], grid: true, tickFormat: (d: number) => `${(d * 100).toFixed(0)}%` },
			marks: [
				Plot.ruleY([ALPHA], { stroke: "var(--color-ink-soft)", strokeDasharray: "3,3" }),
				Plot.barY(rateRows, {
					x: "method",
					y: "rate",
					fill: (d: { method: string }) => (d.method === "Raw" ? "var(--color-ink-soft)" : "var(--color-accent-blue)"),
				}),
			],
		});

		const histRows = [
			...result.raw_detection_days.map((day) => ({ day, method: "Raw" })),
			...result.cuped_detection_days.map((day) => ({ day, method: "CUPED-adjusted" })),
		];
		const rawRows = histRows.filter((r) => r.method === "Raw");
		const cupedRows = histRows.filter((r) => r.method === "CUPED-adjusted");
		const histPlot = Plot.plot({
			width: panelWidth,
			height: 280,
			marginLeft: 40,
			x: { label: "Day of first detection", domain: [1, days] },
			y: { label: "Trials", grid: true },
			marks: [
				Plot.rectY(rawRows, Plot.binX<RectYOptions>({ y: "count" }, { x: "day", thresholds: days, fill: "var(--color-ink-soft)", fillOpacity: 0.7 })),
				Plot.rectY(
					cupedRows,
					Plot.binX<RectYOptions>({ y: "count" }, { x: "day", thresholds: days, fill: "var(--color-accent-blue)", fillOpacity: 0.7 }),
				),
			],
		});

		rateWrap.appendChild(ratePlot);
		histWrap.appendChild(histPlot);
	}

	function renderTable(result: CupedStudyResult) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		const rawMedian = median(result.raw_detection_days);
		const cupedMedian = median(result.cuped_detection_days);
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Method</th><th class="py-2 pr-4">Final-day detection rate</th><th class="py-2 pr-4">Trials that ever detected</th><th class="py-2">Median day of first detection</th>
			</tr></thead>
			<tbody>
				<tr class="border-b border-line/60">
					<td class="py-2 pr-4 font-mono">Raw</td>
					<td class="py-2 pr-4 font-mono">${(result.raw_final_day_detection_rate * 100).toFixed(1)}%</td>
					<td class="py-2 pr-4 font-mono">${result.raw_detection_days.length}/${TRIALS}</td>
					<td class="py-2 font-mono">${rawMedian ?? "—"}</td>
				</tr>
				<tr class="border-b border-line/60">
					<td class="py-2 pr-4 font-mono">CUPED-adjusted</td>
					<td class="py-2 pr-4 font-mono">${(result.cuped_final_day_detection_rate * 100).toFixed(1)}%</td>
					<td class="py-2 pr-4 font-mono">${result.cuped_detection_days.length}/${TRIALS}</td>
					<td class="py-2 font-mono">${cupedMedian ?? "—"}</td>
				</tr>
			</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(result: CupedStudyResult, correlation: number, days: number) {
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${(result.raw_final_day_detection_rate * 100).toFixed(1)}%</span>
			<span class="ml-2 text-sm text-ink-soft">raw final-day detection rate &middot; ${(result.cuped_final_day_detection_rate * 100).toFixed(1)}% CUPED &middot; ${TRIALS} simulated experiments &middot; correlation ${correlation.toFixed(2)} &middot; ${days} days</span>
		`;
	}

	function runStudy() {
		const correlation = Math.min(0.95, Math.max(0, Number(correlationInput.value) || 0));
		const lift = Math.max(0, Number(liftInput.value) || 0);
		const visitorsPerDay = Math.min(500, Math.max(5, Math.round(Number(visitorsInput.value) || 30)));
		const days = Math.min(60, Math.max(5, Math.round(Number(daysInput.value) || 10)));
		correlationValue.textContent = correlation.toFixed(2);

		const result = runCupedStudy({
			trials: TRIALS,
			true_lift: lift,
			y_mean: Y_MEAN,
			y_sd: Y_SD,
			correlation,
			visitors_per_day: visitorsPerDay,
			days,
			alpha: ALPHA,
			seed: Math.floor(Math.random() * 1_000_000_000),
		});

		renderCharts(result, days);
		renderTable(result);
		renderSummary(result, correlation, days);
	}

	correlationInput.addEventListener("input", runStudy);
	liftInput.addEventListener("input", runStudy);
	visitorsInput.addEventListener("input", runStudy);
	daysInput.addEventListener("input", runStudy);
	runButton.addEventListener("click", runStudy);

	runStudy();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#pp-study-controls");
	const root = document.querySelector<HTMLElement>("#pp-speed-study");
	if (controlsForm && root) initSpeedStudy(controlsForm, root);
});
