/**
 * Nao: the site's rain as an all-over textile print.
 *
 * Every ripple is the site's own (dropPaths in ./ripples, with the site's defaults), drawn the way
 * the rain form draws it: drops of different ages, young ones small with a splash in the middle,
 * old ones wider and broken into pieces, streaks and dots. They're scattered loosely over a
 * 27 x 36 in half-drop repeat: the next column of repeats starts half a repeat (18 in) lower, so the
 * same drop never lines up in a row or a column. A drop near an edge is drawn again on the far side
 * of every repeat it reaches, so the cloth has no seam.
 *
 * Units are the site's: a ripple box is 1000 wide. `printIn` says how many inches of cloth 1000
 * units cover; at 15 the ripples sit on a shirt about the size they read on a laptop screen.
 * Deterministic for a seed: the same settings always print the same cloth.
 */
import { BLUR_PER_GAP, dropPaths, type RipplePath } from "./ripples";

export interface NaoSettings {
	/** Inches of cloth per 1000 site units. */
	printIn: number;
	/** Rain drops per repeat. */
	drops: number;
	/** Average space between drops, in site units. */
	minDist: number;
	/** How uneven that spacing is: 0 is even, higher packs some areas and opens others. */
	spread: number;
	/** Small groups of the site's drizzle drops per repeat. */
	drizzle: number;
	/** Rings on the oldest drops (the site's rain uses 10). */
	maxRings: number;
	/** The site's own ripple settings (dropPaths defaults). */
	weight: number;
	shrink: number;
	random: number;
	taper: number;
	bulb: number;
}

/** The settings Kyle locked in on the design board (round 2, version 11). */
export const NAO_DEFAULTS: NaoSettings = {
	printIn: 15,
	drops: 9,
	minDist: 580,
	spread: 0.25,
	drizzle: 1,
	maxRings: 10,
	weight: 0.46,
	shrink: 0.62,
	random: 0.8,
	taper: 0.3,
	bulb: 0.1,
};
export const NAO_SEED = 5;

/** One repeat, in inches. */
export const REPEAT_IN = { w: 27, h: 36 } as const;

// The site's rain gap (rainPaths uses 26 to 40) and the filter Ripples.astro runs.
const RAIN_GAP = 33;
const DRIZZLE_SCALE = 0.55;
export const NAO_FILTER = {
	slope: 22,
	threshold: 0.45,
	blur: { main: Math.round(RAIN_GAP * BLUR_PER_GAP * 10) / 10, fine: Math.round(RAIN_GAP * DRIZZLE_SCALE * BLUR_PER_GAP * 10) / 10 },
} as const;

export interface NaoDrop {
	x: number;
	y: number;
	/** "fine" drops (drizzle) get the smaller blur, like the site's drizzle form. */
	layer: "main" | "fine";
	rings: number;
	gap: number;
	/** How far the drop's marks can reach from its center, blur included. */
	reach: number;
	paths: RipplePath[];
}

export interface Nao {
	seed: number;
	settings: NaoSettings;
	/** One repeat, in site units. */
	W: number;
	H: number;
	drops: NaoDrop[];
}

/** Small seeded PRNG (mulberry32), the same one ripples.ts uses. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const TAU = Math.PI * 2;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** One repeat's size in site units. */
export function repeatSize(printIn: number) {
	// Multiply before dividing, so a whole number of units comes out whole.
	return { W: (REPEAT_IN.w * 1000) / printIn, H: (REPEAT_IN.h * 1000) / printIn };
}

/** The half-drop lattice: one column right drops half a repeat; one step down is a whole repeat. */
const lattice = (W: number, H: number, a: number, b: number): [number, number] => [a * W, a * (H / 2) + b * H];

/** Distance between two points on the cloth, to the nearest repeat of the second. */
export function clothDistance(W: number, H: number, p: [number, number], q: [number, number]): number {
	let best = Infinity;
	for (let a = -2; a <= 2; a++)
		for (let b = -2; b <= 2; b++) {
			const [dx, dy] = lattice(W, H, a, b);
			best = Math.min(best, Math.hypot(p[0] - q[0] - dx, p[1] - q[1] - dy));
		}
	return best;
}

/** Bring a point back into the repeat [0, W) x [0, H). */
function intoRepeat(W: number, H: number, x: number, y: number): [number, number] {
	const a = Math.floor(x / W);
	x -= a * W;
	y -= a * (H / 2);
	y -= Math.floor(y / H) * H;
	return [x, y];
}

// How far a dropPaths ripple can reach: the outermost ring (0.15 + 1.16 per ring, in gaps), its
// wobble and jitter, half the heaviest stroke, and the blur.
const reachOf = (rings: number, gap: number, weight: number) => gap * (0.15 + 1.16 * rings + 0.28 + weight * 0.85) + 3 * NAO_FILTER.blur.main;

export function makeNao(seed: number = NAO_SEED, settings: Partial<NaoSettings> = {}): Nao {
	const P = { ...NAO_DEFAULTS, ...settings };
	const { W, H } = repeatSize(P.printIn);
	const rand = rng(seed);
	const dist = (p: [number, number], q: [number, number]) => clothDistance(W, H, p, q);

	// Uneven spacing: a few smooth waves that repeat with the cloth (each one fits the half-drop
	// lattice exactly), so some areas pack a little tighter and some open up.
	const waves = [
		[1, 0],
		[0, 1],
		[1, 1],
		[2, -1],
	].map(([a, b]) => ({ kx: (TAU * (a - b / 2)) / W, ky: (TAU * b) / H, ph: rand() * TAU }));
	const wave = ([x, y]: [number, number]) => waves.reduce((s, w) => s + Math.cos(w.kx * x + w.ky * y + w.ph), 0) / waves.length;
	const spacing = (p: [number, number]) => P.minDist * (1 + P.spread * wave(p));

	// Rain: dart throwing with that spacing, wrapped across the repeat.
	const pts: [number, number][] = [];
	for (let tries = 0; pts.length < P.drops && tries < 6000; tries++) {
		const c: [number, number] = [rand() * W, rand() * H];
		if (pts.every((q) => dist(c, q) > (spacing(c) + spacing(q)) / 2)) pts.push(c);
	}
	const style = { w: P.weight, shrink: P.shrink, random: P.random, taper: P.taper, bulb: P.bulb };
	const drops: NaoDrop[] = [];
	pts.forEach(([x, y], i) => {
		// The site's rain: a drop's age sets its size, whether its first rings are whole, and whether
		// it keeps the splash in the middle.
		const age = rand();
		const rings = Math.round(3 + age * (P.maxRings - 3));
		const gap = RAIN_GAP - 7 + rand() * 14;
		const paths = dropPaths({ seed: seed * 7919 + i, cx: 0, cy: 0, rings, gap, solid: age < 0.4 ? 2 : 1, center: age < 0.55 ? 0.45 : 0, ...style });
		drops.push({ x, y, layer: "main", rings, gap, reach: reachOf(rings, gap, P.weight), paths });
	});

	// Drizzle: a few of the site's small drops, scattered around the openest spots and kept apart,
	// so they read as strays rather than melting into a blotch.
	const fine: [number, number][] = [];
	for (let k = 0; k < P.drizzle; k++) {
		let best: [number, number] = [0, 0];
		let bs = -1;
		for (let t = 0; t < 60; t++) {
			const c: [number, number] = [rand() * W, rand() * H];
			const s = Math.min(Infinity, ...pts.map((q) => dist(c, q)));
			if (s > bs) [bs, best] = [s, c];
		}
		pts.push(best);
		const n = 3 + Math.floor(rand() * 3);
		for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
			const a = rand() * TAU;
			const d = 60 + Math.sqrt(rand()) * 220;
			const c: [number, number] = [best[0] + d * Math.cos(a), best[1] + d * Math.sin(a)];
			if (fine.some((q) => dist(c, q) < 110)) continue;
			fine.push(c);
			const age = rand();
			const rings = Math.max(1, Math.round((3 + age * 7) * DRIZZLE_SCALE));
			const gap = (RAIN_GAP - 7 + rand() * 14) * DRIZZLE_SCALE;
			const paths = dropPaths({ seed: seed * 104729 + k * 100 + i, cx: 0, cy: 0, rings, gap, solid: age < 0.4 ? 2 : 1, center: age < 0.55 ? 0.45 : 0, ...style });
			drops.push({ x: c[0], y: c[1], layer: "fine", rings, gap, reach: reachOf(rings, gap, P.weight), paths });
			i++;
		}
	}

	for (const d of drops) [d.x, d.y] = intoRepeat(W, H, d.x, d.y);
	return { seed, settings: P, W, H, drops };
}

/** A region of cloth in site units: [x0, y0, x1, y1]. */
export type Region = [number, number, number, number];

/** The full fabric width: two repeats side by side (54 x 36 in), which tiles straight. */
export const fullWidth = (nao: Nao): Region => [0, 0, 2 * nao.W, nao.H];

/** Where a drop shows up in a region: every repeat of it whose reach crosses into the region. */
export function copiesIn(nao: Nao, d: NaoDrop, [x0, y0, x1, y1]: Region): [number, number][] {
	const { W, H } = nao;
	const R = d.reach;
	const out: [number, number][] = [];
	for (let a = Math.floor((x0 - R - d.x) / W); a <= Math.ceil((x1 + R - d.x) / W); a++) {
		const X = d.x + a * W;
		if (X + R < x0 || X - R > x1) continue;
		const yb = d.y + a * (H / 2);
		for (let b = Math.floor((y0 - R - yb) / H); b <= Math.ceil((y1 + R - yb) / H); b++) {
			const Y = yb + b * H;
			if (Y + R < y0 || Y - R > y1) continue;
			out.push([r1(X), r1(Y)]);
		}
	}
	return out;
}

const pathMarkup = (p: RipplePath) => (p.fill ? `<path d="${p.d}" fill="currentColor" stroke="none"/>` : `<path d="${p.d}" stroke-width="${p.width}"/>`);
const filter = (id: string, blur: number, box: string) =>
	`<filter id="${id}" filterUnits="userSpaceOnUse" ${box} color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/><feComponentTransfer><feFuncA type="linear" slope="${NAO_FILTER.slope}" intercept="${-NAO_FILTER.slope * NAO_FILTER.threshold}"/></feComponentTransfer></filter>`;

export interface NaoSvgOptions {
	ground: string;
	ink: string;
	/** The piece of cloth to draw; defaults to the full width. */
	region?: Region;
	/** Pixels per site unit for the width and height attributes (the viewBox stays in units). */
	scale?: number;
	/** Prefix for ids, so several prints can share a page. */
	prefix?: string;
	/** Give every drop a clip circle (id `${prefix}m${i}`), radius 0, for the motion piece to open. */
	open?: boolean;
}

/** The print as a standalone SVG: each drop defined once and placed wherever it shows, then the
 * site's blur-and-cut over each layer, clipped to the region. */
export function naoSvg(nao: Nao, { ground, ink, region = fullWidth(nao), scale = 1, prefix = "nao", open = false }: NaoSvgOptions): string {
	const [x0, y0, x1, y1] = region;
	const w = x1 - x0;
	const h = y1 - y0;
	const box = `x="${r1(x0 - 120)}" y="${r1(y0 - 120)}" width="${r1(w + 240)}" height="${r1(h + 240)}"`;
	const defs = nao.drops
		.map((d, i) => (open ? `<clipPath id="${prefix}m${i}"><circle r="0"/></clipPath>` : "") + `<g id="${prefix}d${i}"${open ? ` clip-path="url(#${prefix}m${i})"` : ""}>${d.paths.map(pathMarkup).join("")}</g>`)
		.join("");
	const layer = (name: NaoDrop["layer"]) =>
		`<g filter="url(#${prefix}f${name})" color="${ink}" fill="none" stroke="currentColor" stroke-linecap="round">${nao.drops
			.map((d, i) => (d.layer === name ? copiesIn(nao, d, region).map(([x, y]) => `<use href="#${prefix}d${i}" x="${x}" y="${y}"/>`).join("") : ""))
			.join("")}</g>`;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(x0)} ${r1(y0)} ${r1(w)} ${r1(h)}" width="${r1(w * scale)}" height="${r1(h * scale)}">`,
		`<defs>${defs}<clipPath id="${prefix}c"><rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(w)}" height="${r1(h)}"/></clipPath>`,
		`${filter(`${prefix}fmain`, NAO_FILTER.blur.main, box)}${filter(`${prefix}ffine`, NAO_FILTER.blur.fine, box)}</defs>`,
		`<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(w)}" height="${r1(h)}" fill="${ground}"/>`,
		`<g clip-path="url(#${prefix}c)">${layer("main")}${layer("fine")}</g>`,
		`</svg>`,
	].join("");
}
