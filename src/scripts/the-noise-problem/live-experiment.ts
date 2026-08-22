// One live simulated experiment on a continuous metric, run twice on the same underlying data (raw
// vs. CUPED-adjusted), revealed day by day so the two p-value/CI-width lines visibly diverge as
// data accumulates, mirroring the reveal pattern from The Peeking Problem's live panel.
import * as Plot from "@observablehq/plot";
import { runCupedExperiment, type CupedDaySnapshot, type CupedExperimentConfig } from "../../lib/stats-sim/cuped-experiment";
import { wireTableToggle } from "../shared/chart-utils";

const Y_MEAN = 100;
const Y_SD = 20;

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

function formatCi(low: number | null, high: number | null): string {
	return low === null || high === null ? "—" : `[${low.toFixed(1)}, ${high.toFixed(1)}]`;
}

export function initLiveExperiment(controlsForm: HTMLFormElement, root: HTMLElement) {
	const correlationInput = controlsForm.querySelector<HTMLInputElement>("#pp-correlation")!;
	const correlationValue = controlsForm.querySelector<HTMLElement>("#pp-correlation-value")!;
	const scenarioSelect = controlsForm.querySelector<HTMLSelectElement>("#pp-scenario")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#pp-lift")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#pp-visitors")!;
	const daysInput = controlsForm.querySelector<HTMLInputElement>("#pp-days")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#pp-run-button")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	correlationInput.value = "0.75";
	scenarioSelect.value = "lift";
	liftInput.value = "4";
	liftInput.disabled = false;
	visitorsInput.value = "30";
	daysInput.value = "20";

	function readConfig(): CupedExperimentConfig {
		const correlation = Math.min(0.95, Math.max(0, Number(correlationInput.value) || 0));
		const hasLift = scenarioSelect.value === "lift";
		const lift = hasLift ? Math.max(0, Number(liftInput.value) || 0) : 0;
		const visitorsPerDay = Math.min(500, Math.max(5, Math.round(Number(visitorsInput.value) || 30)));
		const days = Math.min(60, Math.max(5, Math.round(Number(daysInput.value) || 20)));
		const seed = Math.floor(Math.random() * 1_000_000_000);
		return { true_lift: lift, y_mean: Y_MEAN, y_sd: Y_SD, correlation, visitors_per_day: visitorsPerDay, days, seed };
	}

	function renderCharts(days: CupedDaySnapshot[]) {
		const pValueWrap = document.createElement("div");
		pValueWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">p-value over time</p>';
		const ciWidthWrap = document.createElement("div");
		ciWidthWrap.innerHTML = '<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Confidence interval width</p>';
		chartEl.replaceChildren(pValueWrap, ciWidthWrap);

		const panelWidth = pValueWrap.clientWidth || 400;
		const lastDay = days[days.length - 1]?.day ?? 1;

		const pRows = [
			...days.filter((d) => d.raw_p_value !== null).map((d) => ({ day: d.day, value: d.raw_p_value as number, series: "Raw" })),
			...days.filter((d) => d.cuped_p_value !== null).map((d) => ({ day: d.day, value: d.cuped_p_value as number, series: "CUPED-adjusted" })),
		];
		const pValuePlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 44,
			x: { domain: [1, lastDay], label: "Day", grid: true },
			y: { domain: [0, 1], label: "p-value" },
			color: { domain: ["Raw", "CUPED-adjusted"], range: ["var(--color-ink-soft)", "var(--color-accent-blue)"], legend: true },
			marks: [
				Plot.ruleY([0.05], { stroke: "var(--color-accent-yellow)", strokeDasharray: "4,2" }),
				Plot.line(pRows, { x: "day", y: "value", stroke: "series", strokeWidth: 2, curve: "linear" }),
			],
		});

		const ciRows = [
			...days
				.filter((d) => d.raw_ci_low !== null && d.raw_ci_high !== null)
				.map((d) => ({ day: d.day, value: (d.raw_ci_high as number) - (d.raw_ci_low as number), series: "Raw" })),
			...days
				.filter((d) => d.cuped_ci_low !== null && d.cuped_ci_high !== null)
				.map((d) => ({ day: d.day, value: (d.cuped_ci_high as number) - (d.cuped_ci_low as number), series: "CUPED-adjusted" })),
		];
		const maxWidth = Math.max(1, ...ciRows.map((r) => r.value));
		const ciWidthPlot = Plot.plot({
			width: panelWidth,
			height: 260,
			marginLeft: 44,
			x: { domain: [1, lastDay], label: "Day", grid: true },
			y: { domain: [0, maxWidth * 1.05], label: "95% CI width" },
			color: { domain: ["Raw", "CUPED-adjusted"], range: ["var(--color-ink-soft)", "var(--color-accent-blue)"], legend: true },
			marks: [Plot.line(ciRows, { x: "day", y: "value", stroke: "series", strokeWidth: 2, curve: "linear" })],
		});

		pValueWrap.appendChild(pValuePlot);
		ciWidthWrap.appendChild(ciWidthPlot);
	}

	function renderTable(days: CupedDaySnapshot[]) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Day</th><th class="py-2 pr-4">Raw p-value</th><th class="py-2 pr-4">Raw 95% CI</th><th class="py-2 pr-4">CUPED p-value</th><th class="py-2">CUPED 95% CI</th>
			</tr></thead>
			<tbody>${days
				.map(
					(d) => `<tr class="border-b border-line/60">
				<td class="py-2 pr-4 font-mono">${d.day}</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.raw_p_value)}</td>
				<td class="py-2 pr-4 font-mono">${formatCi(d.raw_ci_low, d.raw_ci_high)}</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(d.cuped_p_value)}</td>
				<td class="py-2 font-mono">${formatCi(d.cuped_ci_low, d.cuped_ci_high)}</td>
			</tr>`,
				)
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(config: CupedExperimentConfig, finalDay: CupedDaySnapshot) {
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${formatPValue(finalDay.raw_p_value)}</span>
			<span class="ml-2 text-sm text-ink-soft">raw p-value &middot; ${formatPValue(finalDay.cuped_p_value)} CUPED p-value &middot; ${config.days} days &middot; ${config.visitors_per_day}/day/arm &middot; correlation ${config.correlation.toFixed(2)}</span>
		`;
	}

	let animationHandle: ReturnType<typeof setInterval> | undefined;

	function runAndAnimate() {
		if (animationHandle) clearInterval(animationHandle);
		const config = readConfig();
		correlationValue.textContent = config.correlation.toFixed(2);
		const result = runCupedExperiment(config);
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
	correlationInput.addEventListener("input", debouncedRun);
	liftInput.addEventListener("input", debouncedRun);
	visitorsInput.addEventListener("input", debouncedRun);
	daysInput.addEventListener("input", debouncedRun);
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
