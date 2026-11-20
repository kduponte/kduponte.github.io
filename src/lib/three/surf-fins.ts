/**
 * Fin outlines for the Volume Gap boards, built from the numbers fin makers publish: base length,
 * depth (height), area and sweep. Like the boards' rail fullness, each outline's one free knob
 * (how full its leading edge bows and how far its trailing edge hooks) is solved so the outline's
 * area equals the published area exactly; where no area is published a typical fullness is used.
 *
 * Plan inches, in the fin's own plane: x runs toward the board's nose, y is negative downward
 * from the base (the fin hangs below the bottom). The base runs from (base/2, 0) at its leading
 * edge to (-base/2, 0) at its trailing edge.
 */
import type { FinSpec } from "../surf-volume/iconic-boards";

export type FinPoint = [number, number];

/** Sweep assumed where a maker publishes none: a neutral modern thruster template. */
export const DEFAULT_SWEEP_DEG = 34;

const TEMPLATE_DEFAULTS: Record<FinSpec["template"], { sweep: number; fullness: number }> = {
	thruster: { sweep: DEFAULT_SWEEP_DEG, fullness: 1 },
	keel: { sweep: 30, fullness: 1.2 },
	stabilizer: { sweep: 30, fullness: 1 },
	single: { sweep: 38, fullness: 0.7 },
	longboard: { sweep: 40, fullness: 0.7 },
	soft: { sweep: 18, fullness: 1.4 },
};

/**
 * How far the tip sits behind the base's leading edge. Fin makers measure sweep as the lean of
 * the line from mid-base to the tip, so the tip lands half a base plus depth x tan(sweep) back.
 */
export function finRakeIn(fin: FinSpec): number {
	const sweep = fin.sweep_deg ?? TEMPLATE_DEFAULTS[fin.template].sweep;
	return fin.base_in / 2 + fin.depth_in * Math.tan((sweep * Math.PI) / 180);
}

function cubic(p0: FinPoint, c1: FinPoint, c2: FinPoint, p3: FinPoint, n: number, out: FinPoint[]) {
	for (let i = 1; i <= n; i++) {
		const t = i / n;
		const u = 1 - t;
		const a = u * u * u;
		const b = 3 * u * u * t;
		const c = 3 * u * t * t;
		const d = t * t * t;
		out.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]]);
	}
}

/**
 * The outline at a given fullness: 0 is a lean fin (straight-ish leading edge, deeply hooked
 * trailing edge), larger values bow the leading edge forward and fill the trailing edge out.
 */
export function finOutlineIn(fin: FinSpec, fullness: number): FinPoint[] {
	const b = fin.base_in;
	const h = fin.depth_in;
	const rake = finRakeIn(fin);
	const k = fullness;
	const front: FinPoint = [b / 2, 0];
	const tip: FinPoint = [b / 2 - rake, -h];
	const rear: FinPoint = [-b / 2, 0];
	const pts: FinPoint[] = [front];
	// Leading edge: rises steeply off the base, then sweeps back into the tip.
	cubic(front, [b / 2 + 0.04 * b, -h * (0.25 + 0.35 * k)], [tip[0] + rake * (0.15 + 0.3 * k), -h], tip, 40, pts);
	// Trailing edge: from the tip back down to the base, hooked (concave) near the base.
	cubic(tip, [tip[0] + b * (0.12 + 0.3 * (1 - k)), -h * 0.62], [-b / 2 + b * (0.04 + 0.24 * (1 - k)), -h * 0.2], rear, 40, pts);
	pts.pop(); // the rear point closes back onto the base
	pts.push(rear);
	return pts;
}

/** Shoelace area of a closed outline, square inches. */
export function outlineArea(pts: FinPoint[]): number {
	let a = 0;
	for (let i = 0; i < pts.length; i++) {
		const [x0, y0] = pts[i];
		const [x1, y1] = pts[(i + 1) % pts.length];
		a += x0 * y1 - x1 * y0;
	}
	return Math.abs(a) / 2;
}

export interface FittedFin {
	points: FinPoint[];
	fullness: number;
	area: number;
}

/** The outline whose area matches the fin's published area (bisected), or a typical one. */
export function fitFinOutline(fin: FinSpec): FittedFin {
	const target = fin.area_in2;
	if (!target) {
		const fullness = TEMPLATE_DEFAULTS[fin.template].fullness;
		const points = finOutlineIn(fin, fullness);
		return { points, fullness, area: outlineArea(points) };
	}
	let lo = -0.5;
	let hi = 3;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (outlineArea(finOutlineIn(fin, mid)) < target) lo = mid;
		else hi = mid;
	}
	const fullness = (lo + hi) / 2;
	const points = finOutlineIn(fin, fullness);
	return { points, fullness, area: outlineArea(points) };
}
