// The launch dashboard's tiles and table as plain HTML strings, shared by the build (set:html) and
// the client script that re-renders them, so a run looks the same before and after JavaScript.
// Pure: no DOM, tested in tests/stats-sim/dashboard-tiles.test.ts.
import { CORRECTION_LABEL, formatLift, formatP } from "./dashboard-readout";
import type { Correction, DashboardMetric, DashboardRun } from "./dashboard-runs";

/**
 * hidden-*: before the reveal. real / false: cleared the bar and truly moved / never moved.
 * missed: truly moved but didn't clear. unmoved: truly null and didn't clear.
 */
export type TileState = "hidden-flat" | "hidden-cleared" | "real" | "false" | "missed" | "unmoved";

export interface TileView {
	metric: DashboardMetric;
	state: TileState;
	cleared: boolean;
	liftText: string;
	/** "10.0% → 17.3%" */
	ratesText: string;
	pText: string;
	/** What the dashboard says: "Significant" or "Not significant", with ▲ or ▼ for a cleared one. */
	status: string;
	statusGlyph: "▲" | "▼" | "";
	/** Revealed only: "True lift +60%" or "True lift 0%". */
	truthText: string | null;
	/** Revealed only: a text mark, so the reveal never rests on color alone. */
	mark: string | null;
	markGlyph: "✓" | "✗" | "";
}

const MARK: Partial<Record<TileState, [string, TileView["markGlyph"]]>> = {
	real: ["Real lift", "✓"],
	false: ["False discovery", "✗"],
	missed: ["Real lift, missed", ""],
};

/** Biggest observed lift first, like a dashboard's "top movers"; a lift that can't be computed goes last. */
export function orderTiles(metrics: DashboardMetric[]): DashboardMetric[] {
	return [...metrics].sort((a, b) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity) || a.number - b.number);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function tileViews(run: DashboardRun, mode: Correction, revealed: boolean): TileView[] {
	return orderTiles(run.metrics).map((m) => {
		const cleared = m.flagged[mode];
		const state: TileState = !revealed
			? cleared
				? "hidden-cleared"
				: "hidden-flat"
			: cleared
				? m.is_null
					? "false"
					: "real"
				: m.is_null
					? "unmoved"
					: "missed";
		const [mark, markGlyph] = (revealed && MARK[state]) || [null, ""];
		return {
			metric: m,
			state,
			cleared,
			liftText: m.lift === null ? "n/a" : formatLift(m.lift),
			ratesText: `${pct(m.rate_a)} → ${pct(m.rate_b)}`,
			pText: `p ${formatP(m.p)}`,
			status: cleared ? "Significant" : "Not significant",
			statusGlyph: cleared ? (m.z > 0 ? "▲" : "▼") : "",
			truthText: revealed ? `True lift ${m.true_lift === 0 ? "0%" : formatLift(m.true_lift)}` : null,
			mark,
			markGlyph,
		};
	});
}

/** Surface per state: paper tiles with ink borders; a cleared tile gets a heavier border and a shadow,
 *  and only the reveal adds color (accent blue for a real lift, the page's coral for a false one). */
export const TILE_CLASS: Record<TileState, string> = {
	"hidden-flat": "border-2 bg-paper text-ink",
	"hidden-cleared": "border-[3px] bg-paper text-ink shadow-hard-sm",
	real: "border-[3px] bg-accent-blue text-paper shadow-hard-sm",
	false: "border-[3px] bg-coral-ring text-ink shadow-hard-sm",
	missed: "border-2 border-dashed bg-paper text-ink",
	unmoved: "border-2 bg-paper text-ink-soft",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function tilesHtml(views: TileView[]): string {
	return views
		.map((v) => {
			// Glyphs are decoration for sighted readers; the words beside them carry the meaning.
			const glyph = (g: string) => (g ? `<span aria-hidden="true">${g}</span> ` : "");
			return (
				`<li class="flex min-h-[8.75rem] flex-col rounded-xl border-ink p-3 ${TILE_CLASS[v.state]}" data-state="${v.state}">` +
				`<p class="text-[13px] font-bold leading-tight">${esc(v.metric.name)}</p>` +
				`<p class="font-anton mt-1.5 text-[2rem] leading-none">${v.liftText}</p>` +
				`<p class="font-mono mt-1.5 text-[9px] uppercase leading-snug">${v.ratesText}<br />${v.pText}</p>` +
				(v.truthText ? `<p class="font-mono mt-1 text-[9px] uppercase leading-snug">${v.truthText}</p>` : "") +
				`<p class="mt-auto flex flex-wrap gap-1 pt-2">` +
				`<span class="label-chip">${glyph(v.statusGlyph)}${v.status}</span>` +
				(v.mark ? `<span class="label-chip">${glyph(v.markGlyph)}${v.mark}</span>` : "") +
				`</p></li>`
			);
		})
		.join("");
}

export function tableHtml(views: TileView[], mode: Correction, revealed: boolean): string {
	const truthCell = (v: TileView) => {
		if (!revealed) return `<span class="text-ink-soft">hidden until you reveal</span>`;
		if (v.state === "false") return `<span class="font-semibold text-[#c6372a]">no real change: false discovery</span>`;
		if (v.state === "real") return `<span class="font-semibold text-accent-blue">real lift, ${v.truthText!.replace("True lift ", "")}</span>`;
		if (v.state === "missed") return `real lift, ${v.truthText!.replace("True lift ", "")}: missed`;
		return `<span class="text-ink-soft">no real change</span>`;
	};
	return (
		`<table class="w-full min-w-[40rem] border-collapse text-left text-sm">` +
		`<caption class="sr-only">The launch dashboard's 20 metrics, biggest observed lift first</caption>` +
		`<thead><tr class="border-b border-line font-mono text-xs uppercase tracking-wide text-ink-soft">` +
		`<th class="py-2 pr-4">Metric</th><th class="py-2 pr-4">Rate A</th><th class="py-2 pr-4">Rate B</th><th class="py-2 pr-4">Observed lift</th>` +
		`<th class="py-2 pr-4">p-value</th><th class="py-2 pr-4">${CORRECTION_LABEL[mode]}</th><th class="py-2">Truth</th></tr></thead><tbody>` +
		views
			.map(
				(v) =>
					`<tr class="border-b border-line/60">` +
					`<td class="py-2 pr-4 font-semibold">${esc(v.metric.name)}</td>` +
					`<td class="py-2 pr-4 font-mono">${pct(v.metric.rate_a)}</td>` +
					`<td class="py-2 pr-4 font-mono">${pct(v.metric.rate_b)}</td>` +
					`<td class="py-2 pr-4 font-mono">${v.liftText}</td>` +
					`<td class="py-2 pr-4 font-mono">${formatP(v.metric.p)}</td>` +
					`<td class="py-2 pr-4 font-mono">${v.cleared ? `cleared ${v.metric.z > 0 ? "(up)" : "(down)"}` : "&mdash;"}</td>` +
					`<td class="py-2 font-mono">${truthCell(v)}</td></tr>`,
			)
			.join("") +
		`</tbody></table>`
	);
}
