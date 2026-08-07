// Seedable PRNG so every simulation run in this series is reproducible and testable — the same
// mulberry32 generator Volume Gap used for its regression bootstrap, promoted here as a shared
// primitive since Beta/Gamma sampling (needed for the Bayesian posterior) builds on it too.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Standard normal variate via Box-Muller. */
export function standardNormal(rng: Rng): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = rng();
	while (v === 0) v = rng();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function bernoulli(p: number, rng: Rng): boolean {
	return rng() < p;
}

export function binomial(n: number, p: number, rng: Rng): number {
	let successes = 0;
	for (let i = 0; i < n; i++) if (bernoulli(p, rng)) successes++;
	return successes;
}

/**
 * Marsaglia-Tsang method for Gamma(shape, 1) samples, shape > 0. For shape < 1, samples
 * Gamma(shape + 1) and applies the standard power-law correction (Gamma(a) = Gamma(a+1) * U^(1/a)),
 * which always terminates in one extra recursion step since shape + 1 >= 1 whenever shape > 0.
 */
export function gammaSample(shape: number, rng: Rng): number {
	if (shape <= 0) throw new Error(`gammaSample requires shape > 0, got ${shape}`);
	if (shape < 1) {
		const u = rng();
		return gammaSample(shape + 1, rng) * Math.pow(u, 1 / shape);
	}
	const d = shape - 1 / 3;
	const c = 1 / Math.sqrt(9 * d);
	for (;;) {
		let x: number;
		let v: number;
		do {
			x = standardNormal(rng);
			v = 1 + c * x;
		} while (v <= 0);
		v = v * v * v;
		const u = rng();
		if (u < 1 - 0.0331 * x * x * x * x) return d * v;
		if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
	}
}

/** Beta(alpha, beta) via the Gamma-ratio method: X ~ Gamma(a), Y ~ Gamma(b) => X/(X+Y) ~ Beta(a,b). */
export function betaSample(alpha: number, beta: number, rng: Rng): number {
	const x = gammaSample(alpha, rng);
	const y = gammaSample(beta, rng);
	return x / (x + y);
}
