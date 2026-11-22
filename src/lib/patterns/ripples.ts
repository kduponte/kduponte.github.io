/**
 * Organic ripple rings (concentric, wobbling, broken into blobby dashes), drawn as SVG paths.
 * Deterministic for a given seed, so a card renders the same rings on every build.
 */

export interface RippleOptions {
	/** Same seed, same rings. */
	seed?: number;
	/** How many rings. */
	rings?: number;
	/** Center in viewBox units (the viewBox is 1000 × 1000). */
	cx?: number;
	cy?: number;
	/** Distance between rings, viewBox units. */
	gap?: number;
	/** How far a ring strays from a circle, as a share of the gap. */
	wobble?: number;
}

export interface RipplePath {
	d: string;
	width: number;
	dash: string;
}

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

const round = (v: number) => Math.round(v * 10) / 10;

export function ripplePaths({ seed = 1, rings = 14, cx = 500, cy = 500, gap = 46, wobble = 0.22 }: RippleOptions = {}): RipplePath[] {
	const rand = rng(seed);
	// Shared low-frequency warps so neighbouring rings bend together, like ripples in water.
	const phases = [rand(), rand(), rand(), rand()].map((p) => p * Math.PI * 2);
	const STEPS = 120;
	const out: RipplePath[] = [];
	for (let k = 1; k <= rings; k++) {
		const r = k * gap;
		const own = rand() * Math.PI * 2;
		const amp = wobble * gap * (0.35 + 0.65 * Math.min(1, k / 5));
		let d = "";
		for (let i = 0; i <= STEPS; i++) {
			const th = (i / STEPS) * Math.PI * 2;
			const n =
				0.55 * Math.sin(3 * th + phases[0] + k * 0.35) +
				0.3 * Math.sin(5 * th + phases[1] - k * 0.5) +
				0.2 * Math.sin(8 * th + phases[2] + own) +
				0.12 * Math.sin(13 * th + phases[3] + k);
			const rr = r + amp * n;
			d += `${i === 0 ? "M" : "L"}${round(cx + rr * Math.cos(th))} ${round(cy + rr * Math.sin(th))}`;
		}
		// Inner rings stay nearly whole; outer ones break up into dashes.
		const circumference = 2 * Math.PI * r;
		const broken = Math.min(1, (k - 1) / (rings * 0.6));
		const segs = 3 + Math.floor(rand() * 6 + broken * 10);
		const dash: number[] = [];
		for (let s = 0; s < segs; s++) {
			const on = (circumference / segs) * (1 - broken * (0.25 + rand() * 0.6));
			const off = circumference / segs - on;
			dash.push(round(Math.max(on, 2)), round(Math.max(off, 0.5)));
		}
		out.push({ d, width: round(gap * (0.14 + rand() * 0.24)), dash: dash.join(" ") });
	}
	return out;
}
