// Draws the winner's-curse study from build-time JSON (runCurseStudy): average observed lift of the
// real winners each rule flags, against visitors per arm and against the number of metrics, with
// the true lift and the no-selection average as reference lines. Nothing is simulated here.
import * as Plot from "@observablehq/plot";
import { formatCount, formatLift, formatShare, RULE_LABELS, RULES, type StudySweep } from "../../lib/stats-sim/winners-curse";
import { wireTableToggle } from "../shared/chart-utils";

const COLORS = ["var(--color-ink-soft)", "var(--color-accent-green)", "var(--color-accent-blue)"];
const SERIES = RULES.map((rule) => RULE_LABELS[rule]);

interface StudyData {
	byVisitors: StudySweep;
	byMetrics: StudySweep;
}

function rowsFor(sweep: StudySweep) {
	return sweep.points.flatMap((p) =>
		RULES.filter((rule) => p.rules[rule].mean_observed_lift !== null).map((rule) => ({
			x: p.x,
			value: p.rules[rule].mean_observed_lift as number,
			series: RULE_LABELS[rule],
		})),
	);
}

/**
 * `doublings`: the visitor levels double each step, so they sit evenly on a log axis; a point scale
 * draws them the same way and, unlike Plot's log axis, labels every one of them.
 */
function panel(sweep: StudySweep, title: string, xLabel: string, doublings: boolean, width: number) {
	const wrap = document.createElement("div");
	wrap.innerHTML = `<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">${title}</p>`;
	const xs = sweep.points.map((p) => p.x);
	const allRows = sweep.points.filter((p) => p.mean_observed_lift_all !== null).map((p) => ({ x: p.x, value: p.mean_observed_lift_all as number }));
	const plot = Plot.plot({
		width,
		height: 280,
		marginLeft: 48,
		x: doublings
			? { type: "point", domain: xs, label: xLabel, tickFormat: (d: number) => formatCount(d), grid: true, inset: 8 }
			: { label: xLabel, ticks: xs, grid: true },
		y: { label: "Avg observed lift, flagged real winners", tickFormat: (d: number) => formatLift(d), zero: true },
		color: { domain: SERIES, range: COLORS, legend: true },
		marks: [
			Plot.ruleY([sweep.true_lift], { stroke: "var(--color-accent-yellow)", strokeWidth: 2, strokeDasharray: "4,2" }),
			Plot.line(allRows, { x: "x", y: "value", stroke: "var(--color-ink-soft)", strokeDasharray: "1,3" }),
			Plot.line(rowsFor(sweep), { x: "x", y: "value", stroke: "series", strokeWidth: 2, marker: "circle" }),
			Plot.tip(rowsFor(sweep), Plot.pointer({ x: "x", y: "value", title: (d: { x: number; value: number; series: string }) => `${d.series}\n${formatCount(d.x)}: ${formatLift(d.value)}` })),
		],
	});
	wrap.appendChild(plot);
	return wrap;
}

function table(sweep: StudySweep, xHeader: string) {
	return `<table class="w-full text-left text-sm">
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">${xHeader}</th><th class="py-2 pr-4">Every real lift</th>
			${RULES.map((rule) => `<th class="py-2 pr-4">${RULE_LABELS[rule]}: avg lift</th><th class="py-2 pr-4">power</th>`).join("")}
		</tr></thead>
		<tbody>${sweep.points
			.map(
				(p) => `<tr class="border-b border-line/60">
			<td class="py-2 pr-4 font-mono">${formatCount(p.x)}</td>
			<td class="py-2 pr-4 font-mono">${formatLift(p.mean_observed_lift_all)}</td>
			${RULES.map((rule) => `<td class="py-2 pr-4 font-mono">${formatLift(p.rules[rule].mean_observed_lift)}</td><td class="py-2 pr-4 font-mono">${formatShare(p.rules[rule].power)}</td>`).join("")}
		</tr>`,
			)
			.join("")}</tbody></table>`;
}

export function initCurseStudy(root: HTMLElement, data: StudyData) {
	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	wireTableToggle(root);

	const visitorsWrap = document.createElement("div");
	const metricsWrap = document.createElement("div");
	chartEl.replaceChildren(visitorsWrap, metricsWrap);
	const width = visitorsWrap.clientWidth || 400;
	visitorsWrap.replaceWith(panel(data.byVisitors, "Against visitors per arm (20 metrics)", "Visitors per arm", true, width));
	metricsWrap.replaceWith(panel(data.byMetrics, `Against number of metrics (${formatCount(data.byMetrics.base_config.visitors_per_arm)} visitors/arm)`, "Number of metrics tested", false, width));

	tableEl.innerHTML = `<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">Against visitors per arm</p>${table(data.byVisitors, "Visitors/arm")}
		<p class="mt-6 font-mono text-xs uppercase tracking-wide text-ink-soft">Against number of metrics</p>${table(data.byMetrics, "Metrics")}`;

	const low = data.byVisitors.points[0];
	const high = data.byVisitors.points.find((p) => p.rules.bonferroni.power >= 0.95) ?? data.byVisitors.points[data.byVisitors.points.length - 1];
	const fewest = data.byMetrics.points[0];
	const most = data.byMetrics.points[data.byMetrics.points.length - 1];
	const noneLifts = data.byMetrics.points.map((p) => p.rules.none.mean_observed_lift).filter((x): x is number => x !== null);
	summaryEl.innerHTML = `
		<p class="text-ink-soft">At <strong class="text-ink">${formatCount(low.x)}</strong> visitors per arm, Bonferroni finds ${formatShare(low.rules.bonferroni.power)} of the real lifts, and the ones it finds average
		<strong class="text-accent-blue">${formatLift(low.rules.bonferroni.mean_observed_lift)}</strong> on a true ${formatLift(data.byVisitors.true_lift)}. At ${formatCount(high.x)} it finds ${formatShare(high.rules.bonferroni.power)}, and they average ${formatLift(high.rules.bonferroni.mean_observed_lift)}.
		Holding traffic at ${formatCount(data.byMetrics.base_config.visitors_per_arm)}, Bonferroni's winners go from ${formatLift(fewest.rules.bonferroni.mean_observed_lift)} at ${fewest.x} metrics to ${formatLift(most.rules.bonferroni.mean_observed_lift)} at ${most.x}, while no correction's, whose bar never moves, stay between ${formatLift(Math.min(...noneLifts))} and ${formatLift(Math.max(...noneLifts))}.</p>
	`;
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#cs-root");
	const dataEl = document.querySelector<HTMLScriptElement>("#cs-data");
	if (root && dataEl?.textContent) initCurseStudy(root, JSON.parse(dataEl.textContent) as StudyData);
});
