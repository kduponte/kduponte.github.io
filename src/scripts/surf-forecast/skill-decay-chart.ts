// The headline: how far off each system is, by how many days ahead it was issued, and whether it
// beats persistence ("the sea will look tomorrow exactly as it does now").
//
// Two charts under one variable switch. Period is deliberately absent: the models' "mean period"
// and the buoy's average period are different quantities (see the period section), so a period
// error here would measure the definitions, not the forecasts.
import * as Plot from "@observablehq/plot";
import type { Variable } from "../../lib/surf-forecast/pairs";
import { REGION_LABEL, type Region } from "../../lib/surf-forecast/spots";
import { wireTableToggle } from "../shared/chart-utils";
import { DISPLAY_UNIT, displayValue, loadForecastData, type SummaryRow } from "./data-client";
import { REPRESENTATIVE, SERIES_COLORS, SERIES_LABELS, SYSTEM_ORDER, labelFor, legendHtml } from "./palette";

const REGIONS: Region[] = ["hawaii", "norcal", "socal"];
const SOURCES = [...SYSTEM_ORDER.map((s) => REPRESENTATIVE[s]), "persistence"] as const;
const SKILL_FLOOR = -1;

interface Point {
	region: string;
	label: string;
	lead: number;
	mae: number;
	skill: number | null;
	within: number | null;
	n: number;
}

function points(rows: SummaryRow[], variable: Variable): Point[] {
	return rows
		.filter((r) => r.variable === variable && (REGIONS as string[]).includes(r.scope) && (SOURCES as readonly string[]).includes(r.source))
		.map((r) => ({
			region: REGION_LABEL[r.scope as Region],
			label: labelFor(r.source),
			lead: r.lead_days,
			mae: displayValue(variable, r.mae) ?? 0,
			skill: r.skill,
			within: r.share_within,
			n: r.n,
		}));
}

/**
 * Wide screens get one plot with the three regions side by side. Narrow screens get three stacked
 * plots under HTML headings, because Plot puts vertical facet labels at the right edge, where a
 * phone clips them. The y domain is passed in explicitly so stacked plots stay comparable.
 */
function layout<T extends { region: string }>(
	data: T[],
	width: number,
	build: (rows: T[], opts: { facet: boolean; height: number; showX: boolean; width: number }) => SVGSVGElement | HTMLElement,
): HTMLElement | SVGSVGElement {
	if (width >= 640) return build(data, { facet: true, height: 300, showX: true, width });
	const wrap = document.createElement("div");
	REGIONS.forEach((r, i) => {
		const block = document.createElement("div");
		block.className = i === 0 ? "" : "mt-4";
		const h = document.createElement("p");
		h.className = "font-mono text-xs uppercase tracking-wide text-ink-soft";
		h.textContent = REGION_LABEL[r];
		block.append(h, build(data.filter((d) => d.region === REGION_LABEL[r]), { facet: false, height: 200, showX: i === REGIONS.length - 1, width }));
		wrap.append(block);
	});
	return wrap;
}

function maeChart(data: Point[], variable: Variable, width: number) {
	const unit = DISPLAY_UNIT[variable];
	const tolerance = variable === "wave_height" ? "within a foot" : "within one compass point";
	const step = variable === "wave_height" ? 0.5 : 10;
	const yMax = Math.ceil(Math.max(...data.map((d) => d.mae)) / step) * step;
	return layout(data, width, (rows, o) => {
		const f = o.facet ? { fx: "region" } : {};
		return Plot.plot({
			width: o.width,
			height: o.height,
			marginLeft: 44,
			marginRight: 16,
			...(o.facet ? { fx: { domain: REGIONS.map((r) => REGION_LABEL[r]), label: null } } : {}),
			x: {
				domain: [0, 7],
				ticks: [0, 1, 2, 3, 4, 5, 6, 7],
				tickFormat: "d",
				label: o.showX ? "Days ahead the forecast was issued" : null,
				labelAnchor: "center",
				axis: o.showX ? "bottom" : null,
			},
			// The HTML heading above the chart names the measure, so the axis carries only the unit.
			y: { domain: [0, yMax], grid: true, label: unit },
			color: { domain: SERIES_LABELS, range: SERIES_COLORS },
			marks: [
				Plot.line(rows, { ...f, x: "lead", y: "mae", stroke: "label", strokeWidth: 2 }),
				Plot.dot(rows, { ...f, x: "lead", y: "mae", fill: "label", r: 4, stroke: "#f4f0e6", strokeWidth: 2 }),
				Plot.tip(
					rows,
					Plot.pointer({
						...f,
						x: "lead",
						y: "mae",
						title: (d: Point) =>
							`${d.label}, ${d.region}\n${d.lead === 0 ? "Latest run" : `${d.lead} day${d.lead === 1 ? "" : "s"} ahead`}\n` +
							`Average miss ${d.mae.toFixed(variable === "wave_height" ? 2 : 0)} ${unit}\n` +
							`${d.within === null ? "" : `${Math.round(d.within * 100)}% ${tolerance}\n`}${d.n.toLocaleString()} forecasts`,
					}),
				),
			],
		});
	});
}

function skillChart(data: Point[], width: number) {
	const scored = data.filter((d) => d.label !== "Persistence" && d.skill !== null && d.lead >= 1);
	// Off-scale values are pinned to the floor and labelled with their real value, not dropped.
	const plotted = scored.map((d) => ({ ...d, shown: Math.max(SKILL_FLOOR, d.skill as number), off: (d.skill as number) < SKILL_FLOOR }));
	// One label per pinned series per region, stating the real range, so a run of points sitting on
	// the floor can never be read as a genuine value of -1.
	const offLabels = [...new Set(plotted.filter((d) => d.off).map((d) => `${d.region}|${d.label}`))].map((k) => {
		const [region, label] = k.split("|");
		const series = plotted.filter((d) => d.region === region && d.label === label && d.off);
		const vals = series.map((d) => d.skill as number);
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		const first = series.reduce((a, b) => (a.lead <= b.lead ? a : b));
		const range = series.length > 1 ? `${hi.toFixed(1)} to ${lo.toFixed(1)}` : lo.toFixed(1);
		return { region, x: first.lead, text: `${label} below scale: ${range}` };
	});
	type P = (typeof plotted)[number];
	return layout(plotted, width, (rows, o) => {
		const f = o.facet ? { fx: "region" } : {};
		const regionsHere = new Set(rows.map((r) => r.region));
		const firstRegion = o.facet ? REGION_LABEL.hawaii : [...regionsHere][0];
		return Plot.plot({
			width: o.width,
			height: o.height,
			marginLeft: 44,
			marginRight: 16,
			...(o.facet ? { fx: { domain: REGIONS.map((r) => REGION_LABEL[r]), label: null } } : {}),
			x: {
				domain: [1, 7],
				ticks: [1, 2, 3, 4, 5, 6, 7],
				tickFormat: "d",
				label: o.showX ? "Days ahead the forecast was issued" : null,
				labelAnchor: "center",
				axis: o.showX ? "bottom" : null,
			},
			y: { domain: [SKILL_FLOOR, 1], grid: true, label: null, tickFormat: (v: number) => (v > 0 ? `+${v}` : `${v}`) },
			color: { domain: SERIES_LABELS, range: SERIES_COLORS },
			marks: [
				Plot.ruleY([0], { stroke: "#857c69", strokeWidth: 1.5 }),
				Plot.text([{ region: firstRegion }], { ...f, x: 7, y: 0, text: () => "Persistence", textAnchor: "end", dy: -7, fill: "#5c5647", fontSize: 10 }),
				Plot.line(rows, { ...f, x: "lead", y: "shown", stroke: "label", strokeWidth: 2 }),
				Plot.dot(rows, { ...f, x: "lead", y: "shown", fill: "label", r: 4, stroke: "#f4f0e6", strokeWidth: 2 }),
				Plot.text(
					offLabels.filter((l) => regionsHere.has(l.region)),
					{ ...f, x: "x", y: SKILL_FLOOR, text: "text", textAnchor: "start", dx: 4, dy: -10, fill: "#5c5647", fontSize: 10 },
				),
				Plot.tip(
					rows,
					Plot.pointer({
						...f,
						x: "lead",
						y: "shown",
						title: (d: P) => {
							const sk = d.skill as number;
							const verdict = sk > 0 ? `${Math.round(sk * 100)}% less squared error than persistence` : "worse than persistence";
							return `${d.label}, ${d.region}\n${d.lead} day${d.lead === 1 ? "" : "s"} ahead\nSkill ${sk >= 0 ? "+" : ""}${sk.toFixed(2)}: ${verdict}`;
						},
					}),
				),
			],
		});
	});
}

function tableHtml(data: Point[], variable: Variable): string {
	const unit = DISPLAY_UNIT[variable];
	const digits = variable === "wave_height" ? 2 : 0;
	const leads = [0, 1, 2, 3, 4, 5, 6, 7];
	const rows = REGIONS.flatMap((region) =>
		[...SYSTEM_ORDER.map((s) => labelFor(REPRESENTATIVE[s])), "Persistence"].map((label) => {
			const cells = leads.map((lead) => {
				const p = data.find((d) => d.region === REGION_LABEL[region] && d.label === label && d.lead === lead);
				if (!p) return `<td class="py-2 pr-3 font-mono text-ink-soft">—</td>`;
				const skill = p.skill === null ? "" : ` <span class="text-ink-soft">(${p.skill >= 0 ? "+" : ""}${p.skill.toFixed(2)})</span>`;
				return `<td class="py-2 pr-3 font-mono">${p.mae.toFixed(digits)}${skill}</td>`;
			});
			return `<tr class="border-b border-line/60"><td class="py-2 pr-4">${REGION_LABEL[region]}</td><td class="py-2 pr-4">${label}</td>${cells.join("")}</tr>`;
		}),
	);
	return `<table class="w-full min-w-[760px] text-left text-sm">
		<caption class="pb-2 text-left text-xs text-ink-soft">Average miss in ${unit} by days ahead, with skill against persistence in brackets.</caption>
		<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">
			<th class="py-2 pr-4">Region</th><th class="py-2 pr-4">Source</th>${leads.map((l) => `<th class="py-2 pr-3">${l === 0 ? "Latest" : `${l}d`}</th>`).join("")}
		</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

export async function initSkillDecay(root: HTMLElement) {
	const { decay } = await loadForecastData();
	const maeEl = root.querySelector<HTMLElement>("[data-fg-mae]")!;
	const skillEl = root.querySelector<HTMLElement>("[data-fg-skill]")!;
	const tableEl = root.querySelector<HTMLElement>("[data-vg-table]")!;
	const legendEl = root.querySelector<HTMLElement>("[data-fg-legend]");
	const unitEls = root.querySelectorAll<HTMLElement>("[data-fg-unit-note]");
	const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-fg-variable]"));
	wireTableToggle(root);
	if (legendEl) legendEl.innerHTML = legendHtml(SERIES_LABELS, SERIES_COLORS);

	let variable: Variable = "wave_height";
	const render = () => {
		const width = maeEl.clientWidth || 720;
		const data = points(decay, variable);
		maeEl.replaceChildren(maeChart(data, variable, width));
		skillEl.replaceChildren(skillChart(data, width));
		tableEl.innerHTML = tableHtml(data, variable);
		for (const el of unitEls) el.textContent = variable === "wave_height" ? "feet" : "degrees";
		for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.fgVariable === variable));
	};

	for (const b of buttons) {
		b.addEventListener("click", () => {
			variable = b.dataset.fgVariable as Variable;
			render();
		});
	}
	let lastWidth = maeEl.clientWidth;
	new ResizeObserver(() => {
		if (Math.abs(maeEl.clientWidth - lastWidth) > 40) {
			lastWidth = maeEl.clientWidth;
			render();
		}
	}).observe(maeEl);
	render();
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#fg-skill-decay");
	if (root) initSkillDecay(root);
});
