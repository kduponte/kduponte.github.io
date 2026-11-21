// Every metric from a batch of seeded dashboards, binned by the lift it showed, split by ground
// truth (truly null on top, truly lifted below) and by whether the chosen rule flagged it. Trap one
// is the flagged bars in the top panel; trap two is where the flagged bars sit in the bottom panel
// relative to the true lift. Seeds are shown and stepped, never random, so every number on screen
// can be reproduced with collectObservations (src/lib/stats-sim/winners-curse.ts).
import * as Plot from "@observablehq/plot";
import {
	collectObservations,
	CURSE_CONFIG,
	formatCount,
	formatLift,
	formatShare,
	RULE_LABELS,
	RULES,
	summarizeObservations,
	trueEffect,
	type MetricObservation,
	type Rule,
} from "../../lib/stats-sim/winners-curse";
import { wireTableToggle } from "../shared/chart-utils";

const DASHBOARDS = 200;
const X_MIN = -1;
const X_MAX = 3;
const BIN = 0.05;
const THRESHOLDS = Array.from({ length: Math.round((X_MAX - X_MIN) / BIN) + 1 }, (_, i) => X_MIN + i * BIN);

const FALSE_COLOR = "#b83a0a";
/** A warm grey between the cream paper and ink-soft; the site's --color-line is black. */
const NOT_FLAGGED_COLOR = "#cfc7b3";
const NOT_FLAGGED = "Not flagged";
const FLAGGED_NULL = "Flagged: false discovery";
const FLAGGED_LIFTED = "Flagged: real winner";

const tickFormat = (d: number) => formatLift(d);

/** Drawn position: lifts past the axis are stacked into its end bins and counted in the note. */
function clampX(lift: number): number {
	return Math.max(X_MIN, Math.min(X_MAX - BIN / 2, lift));
}

export function initCurseLive(controlsForm: HTMLFormElement, root: HTMLElement) {
	const ruleInputs = Array.from(controlsForm.querySelectorAll<HTMLInputElement>('input[name="cl-rule"]'));
	const visitorsSelect = controlsForm.querySelector<HTMLSelectElement>("#cl-visitors")!;
	const seedsEl = controlsForm.querySelector<HTMLElement>("#cl-seeds")!;
	const nextButton = controlsForm.querySelector<HTMLButtonElement>("#cl-next")!;
	const resetButton = controlsForm.querySelector<HTMLButtonElement>("#cl-reset")!;

	const chartEl = root.querySelector<HTMLElement>("[data-vg-chart]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const summaryEl = root.querySelector<HTMLElement>("[data-vg-summary]")!;
	const noteEl = root.querySelector<HTMLElement>("[data-cl-note]")!;
	wireTableToggle(root);

	let firstSeed = 1;
	// No correction first: both traps are visible at once, and switching to a stricter rule then
	// shows the trade (fewer red bars on top, the blue average sliding right below).
	ruleInputs.find((input) => input.value === "none")!.checked = true;
	visitorsSelect.value = String(CURSE_CONFIG.visitors_per_arm);

	const currentRule = (): Rule => (ruleInputs.find((input) => input.checked)?.value as Rule) ?? "none";

	function panel(
		rows: { x: number; status: string }[],
		opts: { title: string; flaggedLabel: string; flaggedColor: string; truth: number; flaggedMean: number | null; allMean: number | null; width: number },
	) {
		const wrap = document.createElement("div");
		wrap.innerHTML = `<p class="font-mono text-xs uppercase tracking-wide text-ink-soft">${opts.title}</p>`;
		const marks: Plot.Markish[] = [
			Plot.rectY(rows, Plot.binX<Plot.RectYOptions>({ y: "count" }, { x: "x", fill: "status", thresholds: THRESHOLDS })),
			Plot.ruleY([0], { stroke: "var(--color-line)" }),
			Plot.ruleX([opts.truth], { stroke: "var(--color-accent-yellow)", strokeWidth: 2, strokeDasharray: "4,2" }),
			Plot.text([opts.truth], { x: (d: number) => d, frameAnchor: "top", dy: -10, dx: -4, textAnchor: "end", text: () => `true ${formatLift(opts.truth)}`, fill: "var(--color-ink)", fontSize: 11 }),
		];
		if (opts.allMean !== null) {
			marks.push(Plot.ruleX([opts.allMean], { stroke: "var(--color-ink-soft)", strokeDasharray: "1,3" }));
		}
		if (opts.flaggedMean !== null) {
			// Pinned to the axis edge (with an arrow) when the average itself is off the axis, and
			// labeled leftward near the right edge so the text stays inside the chart.
			const offAxis = opts.flaggedMean >= X_MAX;
			const drawX = Math.min(opts.flaggedMean, X_MAX - BIN / 2);
			const nearRight = drawX > X_MAX - 0.8;
			const label = `flagged avg ${formatLift(opts.flaggedMean)}${offAxis ? " →" : ""}`;
			marks.push(
				Plot.ruleX([drawX], { stroke: opts.flaggedColor, strokeWidth: 2, strokeDasharray: offAxis ? "2,2" : undefined }),
				Plot.text([drawX], { x: (d: number) => d, frameAnchor: "top", dy: -10, dx: nearRight ? -4 : 4, textAnchor: nearRight ? "end" : "start", text: () => label, fill: opts.flaggedColor, fontSize: 11, fontWeight: 600 }),
			);
		}
		const plot = Plot.plot({
			width: opts.width,
			height: 190,
			marginLeft: 44,
			marginTop: 30,
			x: { label: "Observed lift", domain: [X_MIN, X_MAX], tickFormat },
			y: { label: "Metrics", grid: true },
			color: { domain: [NOT_FLAGGED, opts.flaggedLabel], range: [NOT_FLAGGED_COLOR, opts.flaggedColor], legend: true },
			marks,
		});
		wrap.appendChild(plot);
		return wrap;
	}

	function renderCharts(observations: MetricObservation[], rule: Rule, truthLift: number) {
		const width = chartEl.clientWidth || 600;
		const nullRows: { x: number; status: string }[] = [];
		const liftedRows: { x: number; status: string }[] = [];
		for (const o of observations) {
			if (o.lift === null) continue;
			if (o.is_null) nullRows.push({ x: clampX(o.lift), status: o.flagged[rule] ? FLAGGED_NULL : NOT_FLAGGED });
			else liftedRows.push({ x: clampX(o.lift), status: o.flagged[rule] ? FLAGGED_LIFTED : NOT_FLAGGED });
		}
		const summary = summarizeObservations(observations, rule);
		chartEl.replaceChildren(
			panel(nullRows, {
				title: `Truly null metrics (${formatCount(nullRows.length)})`,
				flaggedLabel: FLAGGED_NULL,
				flaggedColor: FALSE_COLOR,
				truth: 0,
				flaggedMean: null,
				allMean: null,
				width,
			}),
			panel(liftedRows, {
				title: `Truly lifted metrics (${formatCount(liftedRows.length)})`,
				flaggedLabel: FLAGGED_LIFTED,
				flaggedColor: "var(--color-accent-blue)",
				truth: truthLift,
				flaggedMean: summary.mean_lift_flagged,
				allMean: summary.mean_lift_all,
				width,
			}),
		);
	}

	function renderTable(observations: MetricObservation[]) {
		const rows = RULES.map((rule) => ({ rule, s: summarizeObservations(observations, rule) }));
		const all = rows[0].s;
		const table = document.createElement("table");
		table.className = "w-full text-left text-sm";
		table.innerHTML = `
			<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
				<th class="py-2 pr-4">Rule</th><th class="py-2 pr-4">Flags</th><th class="py-2 pr-4">False discoveries</th><th class="py-2 pr-4">Real winners</th><th class="py-2 pr-4">Their avg observed lift</th><th class="py-2">Same winners, re-tested</th>
			</tr></thead>
			<tbody>
				<tr class="border-b border-line/60">
					<td class="py-2 pr-4 text-ink-soft">Every real lift, flagged or not</td><td class="py-2 pr-4 font-mono">&mdash;</td><td class="py-2 pr-4 font-mono">&mdash;</td>
					<td class="py-2 pr-4 font-mono">${formatCount(all.lifted_metrics)}</td><td class="py-2 pr-4 font-mono">${formatLift(all.mean_lift_all)}</td><td class="py-2 font-mono">&mdash;</td>
				</tr>
				${rows
					.map(
						({ rule, s }) => `<tr class="border-b border-line/60">
					<td class="py-2 pr-4">${RULE_LABELS[rule]}</td>
					<td class="py-2 pr-4 font-mono">${formatCount(s.flags)}</td>
					<td class="py-2 pr-4 font-mono">${formatCount(s.null_flags)} (${formatShare(s.flags > 0 ? s.null_flags / s.flags : null)})</td>
					<td class="py-2 pr-4 font-mono">${formatCount(s.lifted_flags)}</td>
					<td class="py-2 pr-4 font-mono">${formatLift(s.mean_lift_flagged)}</td>
					<td class="py-2 font-mono">${formatLift(s.mean_retest_flagged)}</td>
				</tr>`,
					)
					.join("")}
			</tbody>`;
		tableEl.replaceChildren(table);
	}

	function renderSummary(observations: MetricObservation[], rule: Rule, truthLift: number) {
		const s = summarizeObservations(observations, rule);
		const total = observations.length;
		const winners =
			s.lifted_flags > 0
				? `<strong class="text-ink">${formatCount(s.lifted_flags)}</strong> real winners that average <strong class="text-accent-blue">${formatLift(s.mean_lift_flagged)}</strong> observed, on a true ${formatLift(truthLift)} (every real lift, flagged or not, averages ${formatLift(s.mean_lift_all)}). Re-tested on fresh traffic, those same winners average <strong class="text-ink">${formatLift(s.mean_retest_flagged)}</strong>.`
				: `no real winners at all at this traffic level.`;
		summaryEl.innerHTML = `
			<p><span class="font-display text-2xl text-ink">${formatCount(s.flags)}</span>
			<span class="ml-1 text-ink-soft">of ${formatCount(total)} metrics flagged ${rule === "none" ? "with no correction" : `by ${RULE_LABELS[rule]}`}:
			<strong style="color:${FALSE_COLOR}">${formatCount(s.null_flags)}</strong> false discoveries (${formatShare(s.flags > 0 ? s.null_flags / s.flags : null)} of the flags), and ${winners}</span></p>
		`;
	}

	function run() {
		const rule = currentRule();
		const visitors = Number(visitorsSelect.value) || CURSE_CONFIG.visitors_per_arm;
		const config = { ...CURSE_CONFIG, visitors_per_arm: visitors };
		const truthLift = trueEffect(config).lift;
		const observations = collectObservations({ firstSeed, dashboards: DASHBOARDS, config });

		seedsEl.textContent = `Seeds ${formatCount(firstSeed)}–${formatCount(firstSeed + DASHBOARDS - 1)}, ${CURSE_CONFIG.num_metrics} metrics each`;
		renderCharts(observations, rule, truthLift);
		renderTable(observations);
		renderSummary(observations, rule, truthLift);

		const beyond = observations.filter((o) => o.lift !== null && (o.lift < X_MIN || o.lift >= X_MAX)).length;
		const noRatio = observations.filter((o) => o.lift === null).length;
		const notes = [
			`Each bar is ${Math.round(BIN * 100)} points of lift wide. The dotted line is the average of every real lift, flagged or not.`,
			beyond > 0 ? `${formatCount(beyond)} metric${beyond === 1 ? "" : "s"} past the axis ${beyond === 1 ? "is" : "are"} stacked into its end bin.` : "",
			noRatio > 0 ? `${formatCount(noRatio)} metric${noRatio === 1 ? "" : "s"} where arm A converted nobody ${noRatio === 1 ? "has" : "have"} no lift and ${noRatio === 1 ? "is" : "are"} left out.` : "",
		];
		noteEl.textContent = notes.filter(Boolean).join(" ");
	}

	ruleInputs.forEach((input) => input.addEventListener("change", run));
	visitorsSelect.addEventListener("change", run);
	nextButton.addEventListener("click", () => {
		firstSeed += DASHBOARDS;
		run();
	});
	resetButton.addEventListener("click", () => {
		firstSeed = 1;
		run();
	});

	run();
}

document.addEventListener("DOMContentLoaded", () => {
	const controlsForm = document.querySelector<HTMLFormElement>("#cl-controls");
	const root = document.querySelector<HTMLElement>("#cl-root");
	if (controlsForm && root) initCurseLive(controlsForm, root);
});
