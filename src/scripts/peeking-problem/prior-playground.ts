// A live, playable version of the prior/data/posterior tug-of-war described in "What makes a prior
// trustworthy?": three sliders drive the exact Beta-Binomial machinery used everywhere else on this
// page (bayesian.ts), and the resulting three distributions are drawn as real density curves, not an
// illustrative sketch.
import * as Plot from "@observablehq/plot";
import { betaPdf } from "../../lib/stats-sim/beta-distribution";
import { priorStrengthToBetaParams, updatePosterior, type BetaParams } from "../../lib/stats-sim/bayesian";

const ASSUMED_BASELINE = 0.1;
const CHART_DOMAIN_MAX = 0.4;
const CHART_SAMPLE_POINTS = 300;

function sampleCurve(params: BetaParams, series: string): { x: number; y: number; series: string }[] {
	const points: { x: number; y: number; series: string }[] = [];
	for (let i = 1; i < CHART_SAMPLE_POINTS; i++) {
		const x = (i / CHART_SAMPLE_POINTS) * CHART_DOMAIN_MAX;
		points.push({ x, y: betaPdf(x, params.alpha, params.beta), series });
	}
	return points;
}

export function initPriorPlayground(root: ParentNode) {
	const strengthInput = root.querySelector<HTMLInputElement>("#pp-primer-strength")!;
	const strengthValue = root.querySelector<HTMLElement>("#pp-primer-strength-value")!;
	const dataRateInput = root.querySelector<HTMLInputElement>("#pp-primer-data-rate")!;
	const dataRateValue = root.querySelector<HTMLElement>("#pp-primer-data-rate-value")!;
	const visitorsInput = root.querySelector<HTMLInputElement>("#pp-primer-visitors")!;
	const visitorsValue = root.querySelector<HTMLElement>("#pp-primer-visitors-value")!;
	const chartEl = root.querySelector<HTMLElement>("#pp-primer-chart")!;

	strengthInput.value = "0.5";
	dataRateInput.value = "18";
	visitorsInput.value = "150";

	function render() {
		const strength = Number(strengthInput.value);
		const dataRatePct = Number(dataRateInput.value);
		const visitors = Math.round(Number(visitorsInput.value));
		strengthValue.textContent = strength < 0.15 ? "weak" : strength > 0.85 ? "strong" : `${strength.toFixed(2)}`;
		dataRateValue.textContent = `${dataRatePct.toFixed(1)}%`;
		visitorsValue.textContent = visitors.toLocaleString();

		const dataRate = dataRatePct / 100;
		const successes = Math.round(dataRate * visitors);
		const failures = visitors - successes;

		const priorParams = priorStrengthToBetaParams(strength, ASSUMED_BASELINE);
		const dataOnlyParams = updatePosterior({ alpha: 1, beta: 1 }, successes, failures);
		const posteriorParams = updatePosterior(priorParams, successes, failures);

		const rows = [
			...sampleCurve(priorParams, "Prior"),
			...sampleCurve(dataOnlyParams, "Data alone"),
			...sampleCurve(posteriorParams, "Posterior"),
		];

		const plot = Plot.plot({
			width: chartEl.clientWidth || 600,
			height: 280,
			marginLeft: 44,
			x: { domain: [0, CHART_DOMAIN_MAX], label: "Rate", grid: true, tickFormat: (d: number) => `${(d * 100).toFixed(0)}%` },
			y: { label: "Density", ticks: 0 },
			color: {
				domain: ["Prior", "Data alone", "Posterior"],
				range: ["var(--color-accent-blue)", "var(--color-accent-green)", "var(--color-ink)"],
				legend: true,
			},
			marks: [
				Plot.ruleX([ASSUMED_BASELINE], { stroke: "var(--color-line)", strokeDasharray: "3,3" }),
				Plot.line(rows, { x: "x", y: "y", stroke: "series", strokeWidth: 2, curve: "basis" }),
			],
		});
		chartEl.replaceChildren(plot);
	}

	strengthInput.addEventListener("input", render);
	dataRateInput.addEventListener("input", render);
	visitorsInput.addEventListener("input", render);
	window.addEventListener("resize", render);

	render();
}

document.addEventListener("DOMContentLoaded", () => {
	const root = document.querySelector<HTMLElement>("#prior-primer");
	if (root) initPriorPlayground(root);
});
