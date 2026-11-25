// Side-on SVG stand-in for the p-value coaster, shown until WebGL mounts (and kept if it can't):
// the same runs on the same log axis and the same monotone curve between peeks, unrolled flat
// with day across and p down, the glass at alpha, and each run's first dip marked.
import { floorCrossings, hermite, monotoneSlopes, pToY, type CoasterLayout } from "./peeking-coaster";

export const FALLBACK_W = 560;
export const FALLBACK_H = 350;
const X0 = 62;
const X1 = 540;
const Y0 = 24;
const Y1 = 326;

export interface FallbackRun {
	/** Path through every daily peek. */
	d: string;
	/** Where the first dip meets the glass, or null for a run that never dips. */
	mark: { x: number; y: number } | null;
}

export interface FallbackChart {
	floorY: number;
	ticks: { y: number; label: string; accent: boolean }[];
	days: { x: number; label: string }[];
	runs: FallbackRun[];
}

const fx = (u: number, layout: CoasterLayout) => X0 + (u / (layout.days - 1)) * (X1 - X0);
const fy = (y: number, layout: CoasterLayout) => Y1 - (y / layout.height) * (Y1 - Y0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function coasterFallback(runs: number[][], layout: CoasterLayout): FallbackChart {
	const last = layout.days - 1;
	const STEPS = 6;
	return {
		floorY: r1(fy(pToY(layout.alpha, layout), layout)),
		ticks: [1, 0.1, layout.alpha, 0.01, layout.pMin].map((t) => ({
			y: r1(fy(pToY(t, layout), layout)),
			label: String(t),
			accent: t === layout.alpha,
		})),
		days: [1, 10, 20, layout.days].map((d) => ({ x: r1(fx(d - 1, layout)), label: `day ${d}` })),
		runs: runs.map((p) => {
			const ys = p.map((v) => pToY(v, layout));
			const ms = monotoneSlopes(ys);
			const pts: string[] = [];
			for (let i = 0; i <= last * STEPS; i++) {
				const u = i / STEPS;
				pts.push(`${r1(fx(u, layout))} ${r1(fy(hermite(ys, ms, u).y, layout))}`);
			}
			const first = floorCrossings(p, layout).find((c) => c.kind === "down");
			return {
				d: `M${pts.join(" L")}`,
				mark: first ? { x: r1(fx(first.u, layout)), y: r1(fy(pToY(layout.alpha, layout), layout)) } : null,
			};
		}),
	};
}

export const FALLBACK_BOX = { x0: X0, x1: X1, y0: Y0, y1: Y1 };
