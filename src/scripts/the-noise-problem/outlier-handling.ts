// One live simulated experiment on a heavy-tailed hurdle-model revenue metric, run three ways on
// the same underlying data (raw, pooled-threshold, stratified-threshold), revealed day by day so
// the three p-value/estimated-lift lines visibly diverge, mirroring live-experiment.ts's reveal
// pattern for CUPED.
import * as Plot from "@observablehq/plot";
import {
	runOutlierExperiment,
	type OutlierAdjustment,
	type OutlierDaySnapshot,
	type OutlierExperimentConfig,
	type OutlierLiftMode,
} from "../../lib/stats-sim/outlier-handling-experiment";
import { muFromMeanRevenue } from "../../lib/stats-sim/revenue";
import { wireTableToggle } from "../shared/chart-utils";
import { METHOD_COLOR, METHODS, REFERENCE_INK } from "./outlier-palette";

const SPEND_RATE = 0.3;
const SIGMA = 1.2;
const MU = muFromMeanRevenue(60, SIGMA);

const SERIES = METHODS;
const SERIES_COLOR = METHOD_COLOR;

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return ((...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	}) as T;
}

function formatPValue(p: number | null): string {
	return p === null ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3);
}

function formatDollars(value: number | null): string {
	return value === null ? "—" : `$${value.toFixed(2)}`;
}

export function initOutlierHandling(controlsForm: HTMLFormElement, root: HTMLElement) {
	const adjustmentSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-adjustment")!;
	const percentileSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-percentile")!;
	const scenarioSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-scenario")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#oh-lift")!;
	const whaleFractionWrap = controlsForm.querySelector<HTMLElement>("#oh-whale-fraction-wrap")!;
	const whaleFractionSelect = controlsForm.querySelector<HTMLSelectElement>("#oh-whale-fraction")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#oh-visitors")!;
	const daysInput = controlsForm.querySelector<HTMLInputElement>("#oh-days")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#oh-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	adjustmentSelect.value = "winsorize";
	percentileSelect.value = "0.99";
	scenarioSelect.value = "tail_concentrated";
	liftInput.value = "30";
	whaleFractionSelect.value = "0.05";
	visitorsInput.value = "200";
	daysInput.value = "20";

	function syncControlVisibility() {
		const scenario = scenarioSelect.value as OutlierLiftMode;
		liftInput.disabled = scenario === "none";
		whaleFractionWrap.style.display = scenario === "tail_concentrated" ? "" : "none";
	}
	syncControlVisibility();

	function readConfig(): OutlierExperimentConfig {
		const adjustment = adjustmentSelect.value as OutlierAdjustment;
		const upperPercentile = Math.min(0.999, Math.max(0.5, Number(percentileSelect.value) || 0.99));
		const liftMode = scenarioSelect.value as OutlierLiftMode;
		const trueRelativeLift = liftMode === "none" ? 0 : Math.max(0, Number(liftInput.value) || 0) / 100;
		const whaleFraction = Math.min(0.5, Math.max(0.001, Number(whaleFractionSelect.value) || 0.05));
		const visitorsPerDay = Math.min(500, Math.max(5, Math.round(Number(visitorsInput.value) || 200)));
		const days = Math.min(60, Math.max(5, Math.round(Number(daysInput.value) || 20)));
		const seed = Math.floor(Math.random() * 1_000_000_000);
		return {
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
			seed,
		};
	}

	function renderCharts(days: OutlierDaySnapshot[]) {
		const pValueWrap = document.createElement("div");
		pValueWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">p-value over time</p>';
		const liftWrap = document.createElement("div");
		liftWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Estimated lift vs. true lift</p>';
		chartEl.replaceChildren(pValueWrap, liftWrap);

		const panelWidth = pValueWrap.clientWidth || 400;
		const lastDay = days[days.length - 1]?.day ?? 1;

		const pRows = [
			...days.filter((d) => d.raw_p_value !== null).map((d) => ({ day: d.day, value: d.raw_p_value as number, series: "Raw" })),
			...days
				.filter((d) => d.pooled_p_value !== null)
				.map((d) => ({ day: d.day, value: d.pooled_p_value as number, series: "Pooled threshold" })),
			...days
				.filter((d) => d.stratified_p_value !== null)
				.map((d) => ({ day: d.day, value: d.stratified_p_value as number, series: "Stratified threshold" })),
		];
		const pValuePlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 44,
			x: { domain: [1, lastDay], label: "Day", grid: true },
			y: { domain: [0, 1], label: "p-value" },
			color: { domain: SERIES, range: SERIES.map((s) => SERIES_COLOR[s]), legend: true },
			marks: [
				Plot.ruleY([0.05], { stroke: REFERENCE_INK, strokeDasharray: "4,3" }),
				Plot.text([{ x: lastDay, y: 0.05 }], { x: "x", y: "y", text: () => "0.05", textAnchor: "end", dy: -6, fill: REFERENCE_INK, fontSize: 10 }),
				Plot.line(pRows, { x: "day", y: "value", stroke: "series", strokeWidth: 2, curve: "linear" }),
				Plot.tip(pRows, Plot.pointer({ x: "day", y: "value", title: (d: { day: number; value: number; series: string }) => `${d.series}, day ${d.day}\np = ${formatPValue(d.value)}` })),
			],
		});

		const liftRows = [
			...days.map((d) => ({ day: d.day, value: d.raw_mean_b - d.raw_mean_a, series: "Raw" })),
			...days.map((d) => ({ day: d.day, value: d.pooled_mean_b - d.pooled_mean_a, series: "Pooled threshold" })),
			...days.map((d) => ({ day: d.day, value: d.stratified_mean_b - d.stratified_mean_a, series: "Stratified threshold" })),
		];
		const trueLift = days[days.length - 1]?.true_dollar_lift ?? 0;
		const maxLift = Math.max(trueLift * 1.2, 1, ...liftRows.map((r) => Math.abs(r.value)));
		const liftPlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 48,
			x: { domain: [1, lastDay], label: "Day", grid: true },
			y: { domain: [-maxLift * 0.2, maxLift * 1.05], label: "Estimated lift ($)" },
			color: { domain: SERIES, range: SERIES.map((s) => SERIES_COLOR[s]), legend: true },
			marks: [
				Plot.ruleY([0], { stroke: "#dad2c0" }),
				Plot.ruleY([trueLift], { stroke: REFERENCE_INK, strokeDasharray: "4,3" }),
				Plot.text([{ x: lastDay, y: trueLift }], {
					x: "x",
					y: "y",
					text: () => (trueLift > 0 ? `True lift $${trueLift.toFixed(2)}` : "No true lift"),
					textAnchor: "end",
					dy: -6,
					fill: REFERENCE_INK,
					fontSize: 10,
				}),
				Plot.line(liftRows, { x: "day", y: "value", stroke: "series", strokeWidth: 2, curve: "linear" }),
				Plot.tip(liftRows, Plot.pointer({ x: "day", y: "value", title: (d: { day: number; value: number; series: string }) => `${d.series}, day ${d.day}\nEstimated lift ${formatDollars(d.value)}` })),
			],
		});

		pValueWrap.appendChild(pValuePlot);
		liftWrap.appendChild(liftPlot);
	}

	function renderTable(days: OutlierDaySnapshot[]) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Day</th><th class="py-2 pr-4">Raw p</th><th class="py-2 pr-4">Pooled p</th><th class="py-2 pr-4">Stratified p</th><th class="py-2">True lift</th>
			</tr></thead>
			<tbody>${days
				.map(
					(d) => `<tr class="border-b border-line/60">
				<td class="py-2 pr-4 font-mono">${d.day}</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.raw_p_value)}</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.pooled_p_value)}</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.stratified_p_value)}</td>
				<td class="py-2 font-mono">${formatDollars(d.true_dollar_lift)}</td>
			</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(config: OutlierExperimentConfig, finalDay: OutlierDaySnapshot) {
		// All three methods in the same order as the charts. An earlier version headlined the
		// stratified p-value, the one method whose p-values are not trustworthy.
		const line = (name: string, a: number, b: number, p: number | null) =>
			`<span class="whitespace-nowrap">${name}: ${formatDollars(b - a)}, p ${formatPValue(p)}</span>`;
		const truth = finalDay.true_dollar_lift > 0 ? `true lift ${formatDollars(finalDay.true_dollar_lift)}` : "no true lift";
		summaryEl.innerHTML = `<div class="font-sans">
			<p class="text-sm text-ink">Day ${finalDay.day} estimates, ${truth}:</p>
			<p class="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">${line("Raw", finalDay.raw_mean_a, finalDay.raw_mean_b, finalDay.raw_p_value)}${line("Pooled", finalDay.pooled_mean_a, finalDay.pooled_mean_b, finalDay.pooled_p_value)}${line("Stratified", finalDay.stratified_mean_a, finalDay.stratified_mean_b, finalDay.stratified_p_value)}</p>
			<p class="mt-2 text-xs text-ink-soft">${config.days} days, ${config.visitors_per_day} visitors per day per arm, capped at the ${Math.round(config.upper_percentile * 1000) / 10}th percentile. One experiment is one draw of noise; the study below repeats it hundreds of times.</p>
		</div>`;
	}

	let animationHandle: ReturnType<typeof setInterval> | undefined;

	function runAndAnimate() {
		if (animationHandle) clearInterval(animationHandle);
		syncControlVisibility();
		const config = readConfig();
		const result = runOutlierExperiment(config);
		renderTable(result.days);

		let revealed = 0;
		const tickMs = Math.max(30, Math.min(120, 2200 / config.days));
		animationHandle = setInterval(() => {
			revealed += 1;
			const slice = result.days.slice(0, revealed);
			renderCharts(slice);
			renderSummary(config, slice[slice.length - 1]);
			if (revealed >= result.days.length) {
				clearInterval(animationHandle);
				animationHandle = undefined;
			}
		}, tickMs);
	}

	const debouncedRun = debounce(runAndAnimate, 200);
	adjustmentSelect.addEventListener("change", debouncedRun);
	percentileSelect.addEventListener("change", debouncedRun);
	liftInput.addEventListener("input", debouncedRun);
	whaleFractionSelect.addEventListener("change", debouncedRun);
	visitorsInput.addEventListener("input", debouncedRun);
	daysInput.addEventListener("input", debouncedRun);
	scenarioSelect.addEventListener("change", debouncedRun);
	runButton.addEventListener("click", runAndAnimate);

	runAndAnimate();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#oh-controls");
	const root = document.querySelector<HTMLElement>("#oh-live-experiment");
	if (controlsForm && root) initOutlierHandling(controlsForm, root);
});
