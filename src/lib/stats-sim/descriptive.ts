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
