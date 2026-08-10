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

/**
 * Geometric distribution (number of failures before the first success), support {0, 1, 2, ...},
 * via inverse-CDF sampling: for U ~ Uniform(0,1), floor(log(1-U) / log(1-p)) is exactly
 * Geometric(p)-distributed. Used by `binomial` below to sample large-n/small-p binomials in
 * O(successes) time instead of O(n).
 */
export function geometricSample(p: number, rng: Rng): number {
	if (p <= 0) throw new Error(`geometricSample requires p > 0, got ${p}`);
	if (p >= 1) return 0;
	const u = rng();
	return Math.floor(Math.log(1 - u) / Math.log(1 - p));
}

/** Threshold above which both n*p and n*(1-p) are large enough for the normal approximation to
 * be accurate to a small fraction of a percent (a common, conservative rule of thumb). */
const NORMAL_APPROX_THRESHOLD = 50;

/**
 * Binomial(n, p) sampling, using whichever of three methods fits the regime:
 *
 * 1. n < 30: the naive per-trial loop (n is already tiny, so there's nothing to optimize).
 * 2. n*p and n*(1-p) both large (>= 50): a normal approximation with rounding, O(1) regardless
 *    of n. This is what makes exploring high-traffic regimes (100,000+ visitors/day) practical —
 *    without it, even the skip-count method below costs thousands of iterations per call, which
 *    adds up across many simulated days and repeated trials into a multi-second wait in-browser.
 * 3. Otherwise (moderate n, p far from 0.5): exact sampling by counting the "positions" of n
 *    independent Bernoulli(p) trials that land on a success, skipping ahead by a Geometric(p) gap
 *    each time rather than flipping n individual coins — cost O(min(n*p, n*(1-p))), fast whenever
 *    p is far from 0.5 even if the normal approximation isn't yet accurate (e.g. n*p a bit below
 *    the threshold above).
 */
export function binomial(n: number, p: number, rng: Rng): number {
	if (n <= 0 || p <= 0) return 0;
	if (p >= 1) return n;

	if (n < 30) {
		let successes = 0;
		for (let i = 0; i < n; i++) if (bernoulli(p, rng)) successes++;
		return successes;
	}

	const mean = n * p;
	const meanOfComplement = n * (1 - p);
	if (mean >= NORMAL_APPROX_THRESHOLD && meanOfComplement >= NORMAL_APPROX_THRESHOLD) {
		const sd = Math.sqrt(n * p * (1 - p));
		const raw = Math.round(mean + sd * standardNormal(rng));
		return Math.min(n, Math.max(0, raw));
	}

	// Count failures instead when p > 0.5, since the skip-count cost is proportional to the
	// number of "hits" being counted, and hits are the minority outcome exactly when p <= 0.5.
	const countFailures = p > 0.5;
	const skipProb = countFailures ? 1 - p : p;
	let hits = 0;
	let position = -1;
	for (;;) {
		position += geometricSample(skipProb, rng) + 1;
		if (position >= n) break;
		hits++;
	}
	return countFailures ? n - hits : hits;
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
