/**
 * Frames every Observable Plot chart on the page as a numbered magazine figure (.plot-frame in
 * global.css), without touching the individual chart scripts. Charts render after load and some
 * re-render on input, so a MutationObserver keeps framing new ones; framing is idempotent.
 *
 * The frame goes on the chart's container: the parent of the svg, or for small multiples (several
 * charts side by side in sibling wrappers) the shared grandparent, so they sit in one figure.
 * Charts that already live inside a boxed card (.raw-box) or an existing frame are left alone.
 */
const PLOT = 'svg[class^="plot-"], figure[class^="plot-"]';

function frameFor(plot: Element): HTMLElement | null {
	// Plot wraps a chart with a legend or title in its own <figure>; frame around that.
	const chart = plot.parentElement?.closest('figure[class^="plot-"]') ?? plot;
	const parent = chart.parentElement;
	if (!parent || parent.closest(".raw-box, .plot-frame") || chart.closest(".raw-box")) return null;
	const grand = parent.parentElement;
	if (grand && !grand.closest(".raw-box")) {
		// Small multiples: every child of the grandparent is a chart wrapper (nothing else in between).
		const kids = [...grand.children];
		const withPlot = kids.filter((el) => el.querySelector(PLOT));
		const smallMultiples = withPlot.length > 1 && withPlot.length === kids.length;
		if (smallMultiples && !grand.matches("main, section, body, article")) return grand as HTMLElement;
	}
	return parent;
}

function frameAll(root: ParentNode = document) {
	root.querySelectorAll(PLOT).forEach((plot) => {
		if (plot.closest(".plot-frame")) return;
		frameFor(plot)?.classList.add("plot-frame");
	});
}

frameAll();
new MutationObserver((records) => {
	if (records.some((r) => [...r.addedNodes].some((n) => n instanceof Element && (n.matches(PLOT) || n.querySelector(PLOT))))) {
		frameAll();
	}
}).observe(document.body, { childList: true, subtree: true });
