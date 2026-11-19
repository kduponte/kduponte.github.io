// Descriptive statistics shared across projects. Promoted out of Volume Gap's consensus module the
// same way mulberry32 was, once a second project (The Forecast Gap's bootstrap intervals) needed
// the same quantile rather than a near-copy of it.

function sorted(values: number[]): number[] {
	return [...values].sort((a, b) => a - b);
}

/** Linear-interpolation quantile (matches the common "type 7" convention: simple, no dependency). */
export function quantile(values: number[], q: number): number {
	if (values.length === 0) throw new Error("quantile() called with empty array");
	const xs = sorted(values);
	if (xs.length === 1) return xs[0];
	const pos = (xs.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return xs[lo];
	const frac = pos - lo;
	return xs[lo] * (1 - frac) + xs[hi] * frac;
}

export function median(values: number[]): number {
	return quantile(values, 0.5);
}

export function medianAbsoluteDeviation(values: number[]): number {
	const m = median(values);
	return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Wilson score interval for a binomial proportion. Used for simulated false-positive and detection
 * rates, where a rate from a few hundred trials carries real uncertainty (500 trials at a true 5%
 * gives roughly plus or minus 2 points) and the plain normal interval misbehaves near 0.
 */
export function wilsonInterval(successes: number, trials: number, z = 1.959963984540054): { low: number; high: number } {
	if (trials <= 0) return { low: 0, high: 0 };
	const p = successes / trials;
	const z2 = z * z;
	const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
	const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials);
	return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
