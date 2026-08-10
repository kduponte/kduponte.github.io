// One live simulated A/B run, watched by three engines at once, mirrored by an accessible table.
// A "Run new experiment" click (or any control change) computes a fresh run and reveals it day by
// day via a short animation — purely pedagogical (the compute itself is instant), so the p-value,
// posterior, and always-valid lines visibly bounce around as data accumulates, the way a real
// dashboard would. Supports two metric types: revenue per user (the default — a two-part hurdle
// model, most visitors $0, the rest right-skewed) and a simple conversion rate.
import * as Plot from "@observablehq/plot";
import { runSequentialExperiment } from "../../lib/stats-sim/sequential-experiment";
import type { DaySnapshot, ExperimentConfig, MetricType } from "../../lib/stats-sim/types";
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

function formatMetricValue(value: number, metricType: MetricType): string {
	return metricType === "revenue" ? `$${value.toFixed(2)}` : `${(value * 100).toFixed(1)}%`;
}

export function initLiveExperiment(controlsForm: HTMLFormElement, root: HTMLElement) {
	const metricTypeSelect = controlsForm.querySelector<HTMLSelectElement>("#pp-metric-type")!;
	const baselineInput = controlsForm.querySelector<HTMLInputElement>("#pp-baseline-rate")!;
	const baselineLabel = controlsForm.querySelector<HTMLElement>("[data-pp-baseline-label]")!;
	const avgRevenueField = controlsForm.querySelector<HTMLElement>("#pp-avg-revenue-field")!;
	const avgRevenueInput = controlsForm.querySelector<HTMLInputElement>("#pp-avg-revenue")!;
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

	function applyMetricTypeDefaults() {
		const isRevenue = metricTypeSelect.value === "revenue";
		avgRevenueField.hidden = !isRevenue;
		baselineLabel.textContent = isRevenue ? "Spend rate (%)" : "Baseline rate (%)";
		baselineInput.value = isRevenue ? "1" : "10";
		avgRevenueInput.value = "50";
		visitorsInput.value = isRevenue ? "500000" : "50";
	}
	metricTypeSelect.value = "revenue";
	applyMetricTypeDefaults();
	scenarioSelect.value = "none";
	liftInput.value = "20";
	liftInput.disabled = true;
	daysInput.value = "30";
	priorStrengthInput.value = "0";

	function readConfig(): ExperimentConfig {
		const metricType = metricTypeSelect.value as MetricType;
		const baselineRate = Math.min(0.5, Math.max(0.001, (Number(baselineInput.value) || (metricType === "revenue" ? 1 : 10)) / 100));
		const liftPct = Number(liftInput.value) || 0;
		const hasLift = scenarioSelect.value === "lift";
		const visitorsPerDay = Math.min(500_000, Math.max(10, Math.round(Number(visitorsInput.value) || 50)));
		const days = Math.min(60, Math.max(5, Math.round(Number(daysInput.value) || 30)));
		const priorStrength = Math.min(1, Math.max(0, Number(priorStrengthInput.value) || 0));
		const seed = Math.floor(Math.random() * 1_000_000_000);

		if (metricType === "revenue") {
			const avgRevenueA = Math.max(0.01, Number(avgRevenueInput.value) || 50);
			// In revenue mode, "B's lift" changes B's average revenue per spender, not the spend
			// rate: a clean, explainable default scenario (the demo treatment changes how much
			// people spend once they spend, not whether they spend).
			const avgRevenueB = hasLift ? Math.max(0.01, avgRevenueA * (1 + liftPct / 100)) : avgRevenueA;
			return {
				true_rate_a: baselineRate,
				true_rate_b: baselineRate,
				avg_revenue_per_spender_a: avgRevenueA,
				avg_revenue_per_spender_b: avgRevenueB,
				visitors_per_day: visitorsPerDay,
				days,
				prior_strength: priorStrength,
				seed,
				mc_samples: MC_SAMPLES,
				metric_type: "revenue",
			};
		}

		const trueRateB = hasLift ? Math.min(0.99, Math.max(0.001, baselineRate * (1 + liftPct / 100))) : baselineRate;
		return {
			true_rate_a: baselineRate,
			true_rate_b: trueRateB,
			visitors_per_day: visitorsPerDay,
			days,
			prior_strength: priorStrength,
			seed,
			mc_samples: MC_SAMPLES,
			metric_type: "conversion",
		};
	}

	function renderCharts(config: ExperimentConfig, daysSoFar: DaySnapshot[]) {
		// Wrappers are inserted (with just their label, no Plot yet) before measuring width, so
		// the measurement reflects the grid's ACTUAL column count at the current viewport (one
		// column below sm, more at wider breakpoints) rather than assuming a column count and
		// rendering each chart at the wrong width even when the grid has already reflowed.
		const pValueWrap = document.createElement("div");
		pValueWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Frequentist p-value</p>';
		const posteriorWrap = document.createElement("div");
		posteriorWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Bayesian P(B beats A)</p>';
		const alwaysValidWrap = document.createElement("div");
		alwaysValidWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Always-valid p-value</p>';
		chartEl.replaceChildren(pValueWrap, posteriorWrap, alwaysValidWrap);

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

		const alwaysValidPlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 44,
			x: { domain: [1, config.days], label: "Day", grid: true },
			y: { domain: [0, 1], label: "Always-valid p-value" },
			marks: [
				Plot.ruleY([0.05], { stroke: "var(--color-accent-yellow)", strokeDasharray: "4,2" }),
				Plot.line(daysSoFar, { x: "day", y: "always_valid_p_value", stroke: "var(--color-ink)", strokeWidth: 2, curve: "linear" }),
				Plot.dot(daysSoFar.slice(-1), { x: "day", y: "always_valid_p_value", fill: "var(--color-ink)", r: 3 }),
			],
		});

		pValueWrap.appendChild(pValuePlot);
		posteriorWrap.appendChild(posteriorPlot);
		alwaysValidWrap.appendChild(alwaysValidPlot);
	}

	function renderTable(days: DaySnapshot[], metricType: MetricType) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Day</th><th class="py-2 pr-4">Metric A</th><th class="py-2 pr-4">Metric B</th><th class="py-2 pr-4">p-value</th><th class="py-2 pr-4">P(B beats A)</th><th class="py-2">Always-valid p</th>
			</tr></thead>
			<tbody>${days
				.map(
					(d) => `<tr class="border-b border-line/60">
				<td class="py-2 pr-4 font-mono">${d.day}</td>
				<td class="py-2 pr-4 font-mono">${formatMetricValue(d.metric_value_a, metricType)}</td>
				<td class="py-2 pr-4 font-mono">${formatMetricValue(d.metric_value_b, metricType)}</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.p_value)}</td>
				<td class="py-2 pr-4 font-mono">${formatProb(d.posterior_prob_b_beats_a)}</td>
				<td class="py-2 font-mono">${formatPValue(d.always_valid_p_value)}</td>
			</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(config: ExperimentConfig, finalDay: DaySnapshot) {
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${formatPValue(finalDay.p_value)}</span>
			<span class="ml-2 text-sm text-ink-soft">final p-value &middot; ${formatProb(finalDay.posterior_prob_b_beats_a)} posterior P(B beats A) &middot; ${formatPValue(finalDay.always_valid_p_value)} always-valid p &middot; ${config.days} days &middot; ${config.visitors_per_day.toLocaleString()}/day/arm</span>
		`;
	}

	let animationHandle: ReturnType<typeof setInterval> | undefined;

	function runAndAnimate() {
		if (animationHandle) clearInterval(animationHandle);
		const config = readConfig();
		const metricType = config.metric_type ?? "conversion";
		const result = runSequentialExperiment(config);
		renderTable(result.days, metricType);

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
	avgRevenueInput.addEventListener("input", debouncedRun);
	liftInput.addEventListener("input", debouncedRun);
	visitorsInput.addEventListener("input", debouncedRun);
	daysInput.addEventListener("input", debouncedRun);
	priorStrengthInput.addEventListener("input", debouncedRun);
	scenarioSelect.addEventListener("change", () => {
		liftInput.disabled = scenarioSelect.value !== "lift";
		runAndAnimate();
	});
	metricTypeSelect.addEventListener("change", () => {
		applyMetricTypeDefaults();
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
