// Sweeps the metric count across a fixed set of values and runs the repeated-trials study at each,
// rendering family-wise error rate and power as a function of how many metrics are being tested at
// once, the naive/Bonferroni/BH contrast made visible as a trend, not a single snapshot.
import * as Plot from "@observablehq/plot";
import { runMultiMetricStudy } from "../../lib/stats-sim/multi-metric-study";
import { wireTableToggle } from "../shared/chart-utils";

const TRIALS = 300;
const ALPHA = 0.05;
const VISITORS_PER_ARM = 400;
const METRIC_COUNTS = [2, 5, 10, 20, 30, 50];

interface SweepPoint {
	n: number;
	naive_fwer: number;
	bonferroni_fwer: number;
	bh_fwer: number;
	naive_power: number;
	bonferroni_power: number;
	bh_power: number;
}

export function initMetricStudy(controlsForm: HTMLFormElement, root: HTMLElement) {
	const fractionLiftedInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-fraction-lifted")!;
	const fractionLiftedValue = controlsForm.querySelector<HTMLElement>("#pp-study-fraction-lifted-value")!;
	const baselineInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-baseline-rate")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#pp-study-relative-lift")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#pp-study-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	fractionLiftedInput.value = "0.3";
	baselineInput.value = "10";
	liftInput.value = "60";

	function renderCharts(points: SweepPoint[]) {
		const fwerWrap = document.createElement("div");
		fwerWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Family-wise error rate</p>';
		const powerWrap = document.createElement("div");
		powerWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Power to detect real effects</p>';
		chartEl.replaceChildren(fwerWrap, powerWrap);
		const panelWidth = fwerWrap.clientWidth || 400;

		const fwerRows = [
			...points.map((p) => ({ n: p.n, value: p.naive_fwer, series: "Naive" })),
			...points.map((p) => ({ n: p.n, value: p.bonferroni_fwer, series: "Bonferroni" })),
			...points.map((p) => ({ n: p.n, value: p.bh_fwer, series: "Benjamini-Hochberg" })),
		];
		const fwerPlot = Plot.plot({
			width: panelWidth,
			height: 280,
			marginLeft: 44,
			x: { label: "Number of metrics tested", domain: [METRIC_COUNTS[0], METRIC_COUNTS[METRIC_COUNTS.length - 1]], grid: true },
			y: { label: "P(at least one false discovery)", domain: [0, 1], tickFormat: (d: number) => `${(d * 100).toFixed(0)}%` },
			color: {
				domain: ["Naive", "Bonferroni", "Benjamini-Hochberg"],
				range: ["var(--color-ink-soft)", "var(--color-accent-blue)", "var(--color-accent-green)"],
				legend: true,
			},
			marks: [
				Plot.ruleY([ALPHA], { stroke: "var(--color-accent-yellow)", strokeDasharray: "4,2" }),
				Plot.line(fwerRows, { x: "n", y: "value", stroke: "series", strokeWidth: 2, marker: "circle" }),
			],
		});

		const powerRows = [
			...points.map((p) => ({ n: p.n, value: p.naive_power, series: "Naive" })),
			...points.map((p) => ({ n: p.n, value: p.bonferroni_power, series: "Bonferroni" })),
			...points.map((p) => ({ n: p.n, value: p.bh_power, series: "Benjamini-Hochberg" })),
		];
		const powerPlot = Plot.plot({
			width: panelWidth,
			height: 280,
			marginLeft: 44,
			x: { label: "Number of metrics tested", domain: [METRIC_COUNTS[0], METRIC_COUNTS[METRIC_COUNTS.length - 1]], grid: true },
			y: { label: "Fraction of real effects found", domain: [0, 1], tickFormat: (d: number) => `${(d * 100).toFixed(0)}%` },
			color: {
				domain: ["Naive", "Bonferroni", "Benjamini-Hochberg"],
				range: ["var(--color-ink-soft)", "var(--color-accent-blue)", "var(--color-accent-green)"],
				legend: true,
			},
			marks: [Plot.line(powerRows, { x: "n", y: "value", stroke: "series", strokeWidth: 2, marker: "circle" })],
		});

		fwerWrap.appendChild(fwerPlot);
		powerWrap.appendChild(powerPlot);
	}

	function renderTable(points: SweepPoint[]) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Metrics</th><th class="py-2 pr-4">Naive FWER</th><th class="py-2 pr-4">Bonferroni FWER</th><th class="py-2 pr-4">BH FWER</th><th class="py-2 pr-4">Naive power</th><th class="py-2 pr-4">Bonferroni power</th><th class="py-2">BH power</th>
			</tr></thead>
			<tbody>${points
				.map(
					(p) => `<tr class="border-b border-line/60">
				<td class="py-2 pr-4 font-mono">${p.n}</td>
				<td class="py-2 pr-4 font-mono">${(p.naive_fwer * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${(p.bonferroni_fwer * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${(p.bh_fwer * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${(p.naive_power * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${(p.bonferroni_power * 100).toFixed(1)}%</td>
				<td class="py-2 font-mono">${(p.bh_power * 100).toFixed(1)}%</td>
			</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(points: SweepPoint[]) {
		const last = points[points.length - 1];
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${(last.naive_fwer * 100).toFixed(0)}%</span>
			<span class="ml-2 text-sm text-ink-soft">naive FWER at ${last.n} metrics &middot; ${(last.bonferroni_fwer * 100).toFixed(1)}% Bonferroni &middot; ${(last.bh_fwer * 100).toFixed(1)}% BH &middot; ${TRIALS} trials per point</span>
		`;
	}

	function runSweep() {
		const fractionLifted = Math.min(0.6, Math.max(0, Number(fractionLiftedInput.value) || 0));
		const baselineRate = Math.min(0.5, Math.max(0.01, (Number(baselineInput.value) || 10) / 100));
		const relativeLift = Math.max(0.01, (Number(liftInput.value) || 60) / 100);
		fractionLiftedValue.textContent = `${(fractionLifted * 100).toFixed(0)}%`;

		const points: SweepPoint[] = METRIC_COUNTS.map((n) => {
			const result = runMultiMetricStudy({
				trials: TRIALS,
				num_metrics: n,
				fraction_null: 1 - fractionLifted,
				baseline_rate: baselineRate,
				relative_lift: relativeLift,
				visitors_per_arm: VISITORS_PER_ARM,
				alpha: ALPHA,
				seed: Math.floor(Math.random() * 1_000_000_000),
			});
			return {
				n,
				naive_fwer: result.naive_fwer,
				bonferroni_fwer: result.bonferroni_fwer,
				bh_fwer: result.bh_fwer,
				naive_power: result.naive_power,
				bonferroni_power: result.bonferroni_power,
				bh_power: result.bh_power,
			};
		});

		renderCharts(points);
		renderTable(points);
		renderSummary(points);
	}

	fractionLiftedInput.addEventListener("change", runSweep);
	baselineInput.addEventListener("change", runSweep);
	liftInput.addEventListener("change", runSweep);
	runButton.addEventListener("click", runSweep);

	runSweep();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#pp-study-controls");
	const root = document.querySelector<HTMLElement>("#pp-metric-study");
	if (controlsForm && root) initMetricStudy(controlsForm, root);
});
