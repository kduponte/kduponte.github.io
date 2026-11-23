/**
 * Organic water ripples drawn as SVG strokes in a 1000 × 1000 box, after the way Cav Empt's site
 * draws its ripples. Each ring is a run of rounded arc strokes of mixed length and weight: inner
 * rings nearly whole, outer ones broken into oblong dashes and dots. A blur-then-threshold filter
 * (see Ripples.astro) melts strokes that sit close into one shape, so they pinch, taper, swell
 * into blobs and now and then join the ring inside them. Rings drift off true circles.
 *
 * Forms combine ripples: one drop, rain (drops of different ages), an echo from the edge, two drops
 * meeting, and drizzle (many small drops). Deterministic for a given seed, so a tile renders the
 * same ripples on every build.
 */

export type RippleForm = "drop" | "rain" | "echo" | "pair" | "drizzle";

export interface RipplePath {
	d: string;
	/** Stroke width; absent for a filled center drop. */
	width?: number;
	/** A filled shape (the center drop) rather than a stroked arc. */
	fill?: boolean;
}

export interface DropOptions {
	/** Same seed, same ripple. */
	seed?: number;
	/** Center in viewBox units. */
	cx?: number;
	cy?: number;
	/** How many rings. */
	rings?: number;
	/** Average distance between rings, viewBox units. */
	gap?: number;
	/** Stroke weight as a share of the gap. */
	w?: number;
	/** Inner rings drawn whole before they start to break up. */
	solid?: number;
	/** Arc length of a stroke slot, in gaps; larger means fewer, longer strokes. */
	segLen?: number;
	/** How much shorter strokes get toward the outside (0 to 1). */
	shrink?: number;
	/** How much stroke lengths vary within a ring (0 to 1). */
	random?: number;
	/** How far a stroke strays off its ring, in gaps. */
	jitter?: number;
	/** Chance an outer ring is skipped, which leaves an uneven gap. */
	gate?: number;
	/** Chance a stroke reaches back to the ring inside it. */
	bridge?: number;
	/** Share of strokes that taper to a point. */
	taper?: number;
	/** Share of strokes that swell into a blob at one end. */
	bulb?: number;
	/** Radius of the center drop as a share of the gap; 0 for none. */
	center?: number;
	/** How much thinner the outermost ring is than the first (0 to 1). */
	thin?: number;
}

export interface RainOptions {
	seed?: number;
	drops?: number;
	/** Minimum distance between drop centers. */
	minDist?: number;
	/** Scale for ring size and count; drizzle uses small drops. */
	scale?: number;
	/** Range for drop centers on both axes. */
	area?: [number, number];
	/** Separate ranges per axis, e.g. to keep rain to one side of a headline. */
	areaX?: [number, number];
	areaY?: [number, number];
}

export type FormOptions = DropOptions & RainOptions;

/** Small seeded PRNG (mulberry32). */
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

// Coordinates in whole viewBox units (the blur hides anything finer, and it keeps pages light);
// stroke widths keep a tenth so weights vary smoothly.
const px = (v: number) => Math.round(v);
const round = (v: number) => Math.round(v * 10) / 10;
const TAU = Math.PI * 2;

/** Blur radius for the goo filter, as a share of the ring gap. Strokes closer than about this melt
 * together; anything much thinner fades out. */
export const BLUR_PER_GAP = 0.17;

/** One organic ripple. */
export function dropPaths({
	seed = 1,
	cx = 500,
	cy = 500,
	rings = 11,
	gap = 42,
	w = 0.46,
	solid = 2,
	segLen = 1.9,
	shrink = 0.62,
	random = 0.8,
	jitter = 0.09,
	gate = 0.1,
	bridge = 0.035,
	taper = 0.3,
	bulb = 0.1,
	center = 0.45,
	thin = 0.4,
}: DropOptions = {}): RipplePath[] {
	const rand = rng(seed);
	const out: RipplePath[] = [];
	const weight = gap * w;
	const ph = [rand(), rand(), rand()].map((p) => p * TAU);
	// Every ring gets the same number of stroke slots, so slots lengthen as rings grow, like Cav
	// Empt's: inner rings read whole, outer ones open up.
	const slots = Math.max(8, Math.round((TAU * rings * gap * 0.5) / (gap * segLen)));

	const arc = (r: number, a0: number, a1: number, sw: number): RipplePath => {
		const x0 = px(cx + r * Math.cos(a0));
		const y0 = px(cy + r * Math.sin(a0));
		if (Math.abs(a1 - a0) * r < 1.5) return { d: `M${x0} ${y0}h.1`, width: round(sw) };
		const x1 = px(cx + r * Math.cos(a1));
		const y1 = px(cy + r * Math.sin(a1));
		const big = a1 - a0 > Math.PI ? 1 : 0;
		return { d: `M${x0} ${y0}A${px(r)} ${px(r)} 0 ${big} 1 ${x1} ${y1}`, width: round(sw) };
	};

	if (center) {
		// A slightly squashed drop, not a perfect dot.
		const r0 = gap * center * (0.85 + rand() * 0.3);
		const ry = r0 * 0.92;
		out.push({
			fill: true,
			d: `M${round(cx - r0)} ${round(cy)}a${round(r0)} ${round(ry)} 0 1 0 ${round(2 * r0)} 0a${round(r0)} ${round(ry)} 0 1 0 ${round(-2 * r0)} 0Z`,
		});
	}

	let r = gap * 0.15;
	let prev = 0;
	for (let k = 1; k <= rings; k++) {
		r += gap * (0.84 + rand() * 0.32);
		const t = Math.min(1, (k - 1) / Math.max(1, rings - 1));
		// Some rings heavy, some light, all thinning toward the edge.
		const ringW = weight * (0.7 + rand() * 0.6) * (1 - thin * t);
		const ringR = r;
		// Not a perfect circle: the radius drifts with angle.
		const rad = (th: number) =>
			ringR + gap * 0.14 * (0.5 + t) * (0.6 * Math.sin(2 * th + ph[0] + k * 0.5) + 0.4 * Math.sin(3 * th + ph[1] - k * 0.3));

		if (k <= solid) {
			// Whole rings, built from overlapping arcs that swell and thin around the circle.
			const n = 10 + Math.floor(rand() * 6);
			const off = rand() * TAU;
			for (let i = 0; i < n; i++) {
				const a0 = off + (i / n) * TAU;
				const a1 = off + ((i + 1.15) / n) * TAU;
				out.push(arc(rad((a0 + a1) / 2), a0, a1, ringW * (0.8 + rand() * 0.45)));
			}
			prev = ringR;
			continue;
		}
		if (rand() < gate * t) {
			prev = ringR;
			continue;
		}

		const frac = Math.max(0.05, 1 - shrink * t);
		const phase = k * 2.39996 + rand() * TAU;
		const slot = TAU / slots;
		for (let i = 0; i < slots; i++) {
			const half = (slot * frac * (1 - random * rand())) / 2;
			const m = phase + i * slot + slot / 2 + (rand() - 0.5) * slot * 0.25;
			const rr = rad(m) + (rand() - 0.5) * gap * jitter * (0.4 + t);
			const sw = ringW * (0.72 + rand() * 0.56);
			const kind = rand();
			if (kind < taper && half * rr > sw) {
				// Taper: three strokes stepping down in weight toward one end.
				const dir = rand() < 0.5 ? 1 : -1;
				const a0 = m - half;
				const L = 2 * half;
				for (const [p0, p1, s] of [
					[0, 0.55, 1],
					[0.45, 0.8, 0.68],
					[0.72, 1, 0.42],
				]) {
					const b0 = dir > 0 ? a0 + L * p0 : a0 + L * (1 - p1);
					const b1 = dir > 0 ? a0 + L * p1 : a0 + L * (1 - p0);
					out.push(arc(rr, b0, b1, sw * s));
				}
			} else if (kind < taper + bulb) {
				// Blob: a stroke that swells at one end.
				const end = rand() < 0.5 ? m - half : m + half;
				const knob = Math.min(half, (0.6 * sw) / rr);
				out.push(arc(rr, m - half, m + half, sw * 0.85));
				out.push(arc(rr, end - knob, end + knob * 0.2, sw * 1.45));
			} else {
				out.push(arc(rr, m - half, m + half, sw));
			}
			// Now and then a stroke reaches back and joins the ring inside it.
			if (prev && rand() < bridge * (0.4 + t)) {
				const rb = prev + (rr - prev) * 0.15;
				out.push({
					d: `M${px(cx + rb * Math.cos(m))} ${px(cy + rb * Math.sin(m))}L${px(cx + rr * Math.cos(m))} ${px(cy + rr * Math.sin(m))}`,
					width: round(sw * 0.75),
				});
			}
		}
		prev = ringR;
	}
	return out;
}

const RAIN_GAP = 33;

/** Rain: drops of different ages. Young drops are small and keep their splash; old ones have
 * spread wider and broken up. */
export function rainPaths({ seed = 3, drops = 6, minDist = 230, scale = 1, area = [70, 930], areaX = area, areaY = area }: RainOptions = {}): RipplePath[] {
	const rand = rng(seed);
	const pts: [number, number][] = [];
	for (let tries = 0; pts.length < drops && tries < 600; tries++) {
		const x = areaX[0] + rand() * (areaX[1] - areaX[0]);
		const y = areaY[0] + rand() * (areaY[1] - areaY[0]);
		if (pts.every(([px, py]) => Math.hypot(px - x, py - y) > minDist)) pts.push([x, y]);
	}
	return pts.flatMap(([x, y], i) => {
		const age = rand();
		return dropPaths({
			seed: seed * 31 + i,
			cx: x,
			cy: y,
			rings: Math.round((3 + age * 7) * (scale < 1 ? 0.55 : 1)),
			gap: (RAIN_GAP - 7 + rand() * 14) * scale,
			solid: age < 0.4 ? 2 : 1,
			center: age < 0.55 ? 0.45 : 0,
		});
	});
}

const ECHO = { cx: 1010, cy: 500, rings: 17, gap: 58, solid: 2, center: 0.5 };
const PAIR = { rings: 10, gap: 40 };
const DRIZZLE = { drops: 16, minDist: 150, scale: 0.55 };

/** Paths for a named form. Options override the form's defaults. */
export function formPaths(form: RippleForm, o: FormOptions = {}): RipplePath[] {
	const seed = o.seed ?? 1;
	switch (form) {
		case "rain":
			return rainPaths(o);
		case "echo":
			// One big ripple whose center sits just off the edge, so only its outer rings show.
			return dropPaths({ ...ECHO, ...o });
		case "pair": {
			const cx = o.cx ?? 320;
			const cy = o.cy ?? 380;
			return [
				...dropPaths({ ...PAIR, ...o, seed, cx, cy }),
				...dropPaths({ ...PAIR, ...o, seed: seed + 1, cx: 1040 - cx, cy: 1020 - cy }),
			];
		}
		case "drizzle":
			return rainPaths({ ...DRIZZLE, ...o });
		default:
			return dropPaths(o);
	}
}

/** Blur radius for a form's goo filter, in viewBox units. */
export function formBlur(form: RippleForm, o: FormOptions = {}): number {
	let gap: number;
	switch (form) {
		case "rain":
			gap = RAIN_GAP * (o.scale ?? 1);
			break;
		case "drizzle":
			gap = RAIN_GAP * (o.scale ?? DRIZZLE.scale);
			break;
		case "echo":
			gap = o.gap ?? ECHO.gap;
			break;
		case "pair":
			gap = o.gap ?? PAIR.gap;
			break;
		default:
			gap = o.gap ?? 42;
	}
	return round(gap * BLUR_PER_GAP);
}

/** A stable seed from a string, e.g. a slug. */
export function seedFrom(text: string, start = 7): number {
	return [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, start);
}
