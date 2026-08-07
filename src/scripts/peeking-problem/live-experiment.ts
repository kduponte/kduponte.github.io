// One live simulated A/B run, watched by both engines at once, mirrored by an accessible table.
// A "Run new experiment" click (or any control change) computes a fresh run and reveals it day by
// day via a short animation — purely pedagogical (the compute itself is instant), so the p-value
// and posterior lines visibly bounce around as data accumulates, the way a real dashboard would.
import * as Plot from "@observablehq/plot";
import { runSequentialExperiment } from "../../lib/stats-sim/sequential-experiment";
import type { DaySnapshot, ExperimentConfig } from "../../lib/stats-sim/types";
import { wireTableToggle } from "../shared/chart-utils";

const BAYESIAN_REFERENCE_LOW = 0.025;
const BAYESIAN_REFERENCE_HIGH = 0.975;
const MC_SAMPLES = 1500;

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

function formatProb(p: number | null): string {
	return p === null ? "—" : `${(p * 100).toFixed(1)}%`;
}

export function initLiveExperiment(controlsForm: HTMLFormElement, root: HTMLElement) {
	const baselineInput = controlsForm.querySelector<HTMLInputElement>("#pp-baseline-rate")!;
	const scenarioSelect = controlsForm.querySelector<HTMLSelectElement>("#pp-scenario")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#pp-lift")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#pp-visitors")!;
	const daysInput = controlsForm.querySelector<HTMLInputElement>("#pp-days")!;
	const priorStrengthInput = controlsForm.querySelector<HTMLInputElement>("#pp-prior-strength")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#pp-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	baselineInput.value = "10";
	scenarioSelect.value = "none";
	liftInput.value = "20";
	liftInput.disabled = true;
	visitorsInput.value = "50";
	daysInput.value = "30";
	priorStrengthInput.value = "0";

	function readConfig(): ExperimentConfig {
		const baselineRate = Math.min(0.5, Math.max(0.01, (Number(baselineInput.value) || 10) / 100));
		const liftPct = Number(liftInput.value) || 0;
		const trueRateB = scenarioSelect.value === "lift" ? Math.min(0.99, Math.max(0.001, baselineRate * (1 + liftPct / 100))) : baselineRate;
		const visitorsPerDay = Math.min(1000, Math.max(10, Math.round(Number(visitorsInput.value) || 50)));
		const days = Math.min(60, Math.max(5, Math.round(Number(daysInput.value) || 30)));
		const priorStrength = Math.min(1, Math.max(0, Number(priorStrengthInput.value) || 0));
		return {
			true_rate_a: baselineRate,
			true_rate_b: trueRateB,
			visitors_per_day: visitorsPerDay,
			days,
			prior_strength: priorStrength,
			seed: Math.floor(Math.random() * 1_000_000_000),
			mc_samples: MC_SAMPLES,
		};
	}

	function renderCharts(config: ExperimentConfig, daysSoFar: DaySnapshot[]) {
		// Wrappers are inserted (with just their label, no Plot yet) before measuring width, so
		// the measurement reflects the grid's ACTUAL column count at the current viewport (one
		// column below md, two at/above it) rather than assuming two columns and rendering each
		// chart at half the available width even when the grid has already stacked to one.
		const pValueWrap = document.createElement("div");
		pValueWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Frequentist p-value</p>';
		const posteriorWrap = document.createElement("div");
		posteriorWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Bayesian P(B beats A)</p>';
		chartEl.replaceChildren(pValueWrap, posteriorWrap);

		const panelWidth = pValueWrap.clientWidth || 300;

		const pValuePlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 44,
			x: { domain: [1, config.days], label: "Day", grid: true },
			y: { domain: [0, 1], label: "p-value" },
			marks: [
				Plot.ruleY([0.05], { stroke: "var(--color-accent-yellow)", strokeDasharray: "4,2" }),
				Plot.line(daysSoFar, { x: "day", y: "p_value", stroke: "var(--color-accent-blue)", strokeWidth: 2, curve: "linear" }),
				Plot.dot(daysSoFar.slice(-1), { x: "day", y: "p_value", fill: "var(--color-accent-blue)", r: 3 }),
			],
		});

		const posteriorPlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 44,
			x: { domain: [1, config.days], label: "Day", grid: true },
			y: { domain: [0, 1], label: "P(B beats A)" },
			marks: [
				Plot.ruleY([BAYESIAN_REFERENCE_LOW, BAYESIAN_REFERENCE_HIGH], { stroke: "var(--color-accent-yellow)", strokeDasharray: "4,2" }),
				Plot.line(daysSoFar, { x: "day", y: "posterior_prob_b_beats_a", stroke: "var(--color-accent-green)", strokeWidth: 2, curve: "linear" }),
				Plot.dot(daysSoFar.slice(-1), { x: "day", y: "posterior_prob_b_beats_a", fill: "var(--color-accent-green)", r: 3 }),
			],
		});

		pValueWrap.appendChild(pValuePlot);
		posteriorWrap.appendChild(posteriorPlot);
	}

	function renderTable(days: DaySnapshot[]) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Day</th><th class="py-2 pr-4">Rate A</th><th class="py-2 pr-4">Rate B</th><th class="py-2 pr-4">p-value</th><th class="py-2">P(B beats A)</th>
			</tr></thead>
			<tbody>${days
				.map(
					(d) => `<tr class="border-b border-line/60">
				<td class="py-2 pr-4 font-mono">${d.day}</td>
				<td class="py-2 pr-4 font-mono">${(d.rate_a * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${(d.rate_b * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.p_value)}</td>
				<td class="py-2 font-mono">${formatProb(d.posterior_prob_b_beats_a)}</td>
			</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(config: ExperimentConfig, finalDay: DaySnapshot) {
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${formatPValue(finalDay.p_value)}</span>
			<span class="ml-2 text-sm text-ink-soft">final p-value &middot; ${formatProb(finalDay.posterior_prob_b_beats_a)} posterior P(B beats A) &middot; ${config.days} days &middot; ${config.visitors_per_day}/day/arm</span>
		`;
	}

	let animationHandle: ReturnType<typeof setInterval> | undefined;

	function runAndAnimate() {
		if (animationHandle) clearInterval(animationHandle);
		const config = readConfig();
		const result = runSequentialExperiment(config);
		renderTable(result.days);

		let revealed = 0;
		const tickMs = Math.max(30, Math.min(120, 2200 / config.days));
		animationHandle = setInterval(() => {
			revealed += 1;
			const slice = result.days.slice(0, revealed);
			renderCharts(config, slice);
			renderSummary(config, slice[slice.length - 1]);
			if (revealed >= result.days.length) {
				clearInterval(animationHandle);
				animationHandle = undefined;
			}
		}, tickMs);
	}

	const debouncedRun = debounce(runAndAnimate, 200);
	baselineInput.addEventListener("input", debouncedRun);
	liftInput.addEventListener("input", debouncedRun);
	visitorsInput.addEventListener("input", debouncedRun);
	daysInput.addEventListener("input", debouncedRun);
	priorStrengthInput.addEventListener("input", debouncedRun);
	scenarioSelect.addEventListener("change", () => {
		liftInput.disabled = scenarioSelect.value !== "lift";
		runAndAnimate();
	});
	runButton.addEventListener("click", runAndAnimate);

	runAndAnimate();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#pp-controls");
	const root = document.querySelector<HTMLElement>("#pp-live-experiment");
	if (controlsForm && root) initLiveExperiment(controlsForm, root);
});
