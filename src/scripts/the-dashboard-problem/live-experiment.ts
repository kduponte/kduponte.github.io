// A single simulated dashboard of N metrics, real p-values from real simulated binomial data, run
// through three decision rules at once so a false discovery under "naive" and its correct
// suppression under Bonferroni/BH are both directly visible, not just described.
import { simulateMetricBatch, type MetricOutcome } from "../../lib/stats-sim/multi-metric-experiment";
import { benjaminiHochberg, bonferroniRejections, naiveRejections } from "../../lib/stats-sim/multiple-testing";

const ALPHA = 0.05;

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return ((...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	}) as T;
}

function formatPValue(p: number): string {
	return p < 0.001 ? "<0.001" : p.toFixed(3);
}

function flagCell(flagged: boolean, isFalsePositive: boolean): string {
	if (!flagged) return `<span class="text-ink-soft">&mdash;</span>`;
	const cls = isFalsePositive ? "text-accent-yellow font-semibold" : "text-accent-blue font-semibold";
	const label = isFalsePositive ? "flagged (false)" : "flagged";
	return `<span class="${cls}">${label}</span>`;
}

export function initLiveExperiment(controlsForm: HTMLFormElement, root: HTMLElement) {
	const numMetricsInput = controlsForm.querySelector<HTMLInputElement>("#pp-num-metrics")!;
	const numMetricsValue = controlsForm.querySelector<HTMLElement>("#pp-num-metrics-value")!;
	const fractionLiftedInput = controlsForm.querySelector<HTMLInputElement>("#pp-fraction-lifted")!;
	const fractionLiftedValue = controlsForm.querySelector<HTMLElement>("#pp-fraction-lifted-value")!;
	const baselineInput = controlsForm.querySelector<HTMLInputElement>("#pp-baseline-rate")!;
	const liftInput = controlsForm.querySelector<HTMLInputElement>("#pp-relative-lift")!;
	const visitorsInput = controlsForm.querySelector<HTMLInputElement>("#pp-visitors")!;
	const runButton = controlsForm.querySelector<HTMLButtonElement>("#pp-run-button")!;

	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;

	numMetricsInput.value = "20";
	fractionLiftedInput.value = "0.3";
	baselineInput.value = "10";
	liftInput.value = "60";
	visitorsInput.value = "400";

	function renderTable(outcomes: MetricOutcome[], naive: boolean[], bonferroni: boolean[], bh: boolean[]) {
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Metric</th><th class="py-2 pr-4">Rate A</th><th class="py-2 pr-4">Rate B</th><th class="py-2 pr-4">p-value</th><th class="py-2 pr-4">Ground truth*</th><th class="py-2 pr-4">Naive</th><th class="py-2 pr-4">Bonferroni</th><th class="py-2">Benjamini-Hochberg</th>
			</tr></thead>
			<tbody>${outcomes
				.map((o, i) => {
					const isFalsePositive = o.is_null;
					return `<tr class="border-b border-line/60">
				<td class="py-2 pr-4 font-mono">#${o.metric_index + 1}</td>
				<td class="py-2 pr-4 font-mono">${(o.rate_a * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${(o.rate_b * 100).toFixed(1)}%</td>
				<td class="py-2 pr-4 font-mono">${formatPValue(o.p_value)}</td>
				<td class="py-2 pr-4 font-mono text-ink-soft">${o.is_null ? "no real difference" : "real lift"}</td>
				<td class="py-2 pr-4 font-mono">${flagCell(naive[i], isFalsePositive && naive[i])}</td>
				<td class="py-2 pr-4 font-mono">${flagCell(bonferroni[i], isFalsePositive && bonferroni[i])}</td>
				<td class="py-2 font-mono">${flagCell(bh[i], isFalsePositive && bh[i])}</td>
			</tr>`;
				})
				.join("")}</tbody>`;
		tableEl.replaceChildren(table);
		const caption = document.createElement("p");
		caption.className = "mt-2 text-xs leading-relaxed text-ink-soft";
		caption.textContent =
			"*Ground truth is only knowable here because this is simulated. A real dashboard never gets to see this column, that's exactly the problem.";
		tableEl.appendChild(caption);
	}

	function renderSummary(naive: boolean[], bonferroni: boolean[], bh: boolean[], outcomes: MetricOutcome[]) {
		const isNull = outcomes.map((o) => o.is_null);
		const naiveFalse = naive.filter((flagged, i) => flagged && isNull[i]).length;
		const bonferroniFalse = bonferroni.filter((flagged, i) => flagged && isNull[i]).length;
		const bhFalse = bh.filter((flagged, i) => flagged && isNull[i]).length;
		summaryEl.innerHTML = `
			<span class="font-display text-2xl text-ink">${naive.filter(Boolean).length}</span>
			<span class="ml-2 text-sm text-ink-soft">metrics flagged by naive (${naiveFalse} of them false) &middot; ${bonferroni.filter(Boolean).length} by Bonferroni (${bonferroniFalse} false) &middot; ${bh.filter(Boolean).length} by BH (${bhFalse} false)</span>
		`;
	}

	function run() {
		const numMetrics = Math.min(50, Math.max(2, Math.round(Number(numMetricsInput.value) || 20)));
		const fractionLifted = Math.min(0.6, Math.max(0, Number(fractionLiftedInput.value) || 0));
		const baselineRate = Math.min(0.5, Math.max(0.01, (Number(baselineInput.value) || 10) / 100));
		const relativeLift = Math.max(0.01, (Number(liftInput.value) || 60) / 100);
		const visitorsPerArm = Math.min(5000, Math.max(50, Math.round(Number(visitorsInput.value) || 400)));

		numMetricsValue.textContent = String(numMetrics);
		fractionLiftedValue.textContent = `${(fractionLifted * 100).toFixed(0)}%`;

		const outcomes = simulateMetricBatch({
			num_metrics: numMetrics,
			fraction_null: 1 - fractionLifted,
			baseline_rate: baselineRate,
			relative_lift: relativeLift,
			visitors_per_arm: visitorsPerArm,
			seed: Math.floor(Math.random() * 1_000_000_000),
		});

		const pValues = outcomes.map((o) => o.p_value);
		const naive = naiveRejections(pValues, ALPHA);
		const bonferroni = bonferroniRejections(pValues, ALPHA);
		const bh = benjaminiHochberg(pValues, ALPHA);

		renderTable(outcomes, naive, bonferroni, bh);
		renderSummary(naive, bonferroni, bh, outcomes);
	}

	const debouncedRun = debounce(run, 200);
	numMetricsInput.addEventListener("input", debouncedRun);
	fractionLiftedInput.addEventListener("input", debouncedRun);
	baselineInput.addEventListener("input", debouncedRun);
	liftInput.addEventListener("input", debouncedRun);
	visitorsInput.addEventListener("input", debouncedRun);
	runButton.addEventListener("click", run);

	run();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#pp-controls");
	const root = document.querySelector<HTMLElement>("#pp-live-experiment");
	if (controlsForm && root) initLiveExperiment(controlsForm, root);
});
