// The launch dashboard's controls: Next run steps through seeds 1 to 20 in order (and hides the truth
// again), Reveal truth shows which metrics truly moved, and the rule toggles move the bar. Every
// word and tile comes from the same pure helpers the build used, so the first render and every
// later one match.
import { describeRun } from "../../lib/stats-sim/dashboard-readout";
import { LAUNCH_SEEDS, runDashboard, type Correction, type DashboardRun } from "../../lib/stats-sim/dashboard-runs";
import { tableHtml, tileViews, tilesHtml } from "../../lib/stats-sim/dashboard-tiles";
import { wireTableToggle } from "../shared/chart-utils";

const cache = new Map<number, DashboardRun>();
const runAt = (index: number) => {
	const seed = LAUNCH_SEEDS[index];
	if (!cache.has(seed)) cache.set(seed, runDashboard(seed));
	return cache.get(seed)!;
};

for (const root of document.querySelectorAll<HTMLElement>("[data-launch]")) {
	const el = (key: string) => root.querySelector<HTMLElement>(`[data-l-${key}]`)!;
	const [eyebrow, count, headline, bar, rule, prompt, revealed, falseN, falseLabel, truth, curse, missed, tiles, table] = [
		"eyebrow",
		"count",
		"headline",
		"bar",
		"rule",
		"prompt",
		"revealed",
		"false",
		"false-label",
		"truth",
		"curse",
		"missed",
		"tiles",
		"table",
	].map(el);
	const next = root.querySelector<HTMLButtonElement>("[data-l-next]")!;
	const reveal = root.querySelector<HTMLButtonElement>("[data-l-reveal]")!;
	const modeButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-l-mode]")];

	const state = { index: 0, mode: "none" as Correction, revealed: false };

	const render = () => {
		const run = runAt(state.index);
		const r = describeRun(run, state.mode, state.index, LAUNCH_SEEDS.length);
		const views = tileViews(run, state.mode, state.revealed);
		eyebrow.textContent = r.eyebrow;
		count.textContent = String(r.cleared.length);
		headline.textContent = r.headline;
		bar.textContent = r.bar;
		rule.textContent = r.rule;
		prompt.hidden = state.revealed;
		revealed.hidden = !state.revealed;
		falseN.textContent = String(r.falseCount);
		falseLabel.textContent = r.falseCount === 1 ? "false discovery" : "false discoveries";
		truth.textContent = r.truth;
		curse.textContent = r.curse;
		missed.textContent = r.missedLine;
		tiles.innerHTML = tilesHtml(views);
		table.innerHTML = tableHtml(views, state.mode, state.revealed);
		reveal.setAttribute("aria-pressed", String(state.revealed));
		reveal.textContent = state.revealed ? "Hide truth" : "Reveal truth";
		for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.lMode === state.mode));
	};

	next.addEventListener("click", () => {
		state.index = (state.index + 1) % LAUNCH_SEEDS.length;
		state.revealed = false;
		render();
	});
	reveal.addEventListener("click", () => {
		state.revealed = !state.revealed;
		render();
	});
	for (const b of modeButtons) {
		b.addEventListener("click", () => {
			state.mode = b.dataset.lMode as Correction;
			render();
		});
	}
	wireTableToggle(root);
}
