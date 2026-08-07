// Pooled two-proportion z-test. The normal CDF is a hand-rolled Abramowitz-Stegun erf
// approximation (same rigor tier as Volume Gap's hand-rolled OLS) rather than a stats dependency.

/** Abramowitz & Stegun 7.1.26 approximation, max error ~1.5e-7. */
function erf(x: number): number {
	const sign = x < 0 ? -1 : 1;
	const ax = Math.abs(x);
	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;
	const t = 1 / (1 + p * ax);
	const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
	return sign * y;
}

export function standardNormalCdf(z: number): number {
	return 0.5 * (1 + erf(z / Math.SQRT2));
}

export interface TwoProportionTest {
	rate_a: number;
	rate_b: number;
	z: number | null;
	p_value: number | null;
}

/**
 * Pooled two-proportion z-test. Returns null z/p when either arm has zero trials or the pooled
 * variance is degenerate (e.g. 0/0 successes on both arms) — "not enough data yet", never a fake 0,
 * mirroring the "unavailable, never a hidden zero" convention from the previous project in this series.
 */
export function twoProportionZTest(successesA: number, trialsA: number, successesB: number, trialsB: number): TwoProportionTest {
	const rateA = trialsA > 0 ? successesA / trialsA : 0;
	const rateB = trialsB > 0 ? successesB / trialsB : 0;
	if (trialsA === 0 || trialsB === 0) return { rate_a: rateA, rate_b: rateB, z: null, p_value: null };

	const pooled = (successesA + successesB) / (trialsA + trialsB);
	const se = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB));
	if (se === 0) return { rate_a: rateA, rate_b: rateB, z: null, p_value: null };

	const z = (rateB - rateA) / se;
	const pValue = 2 * (1 - standardNormalCdf(Math.abs(z)));
	return { rate_a: rateA, rate_b: rateB, z, p_value: pValue };
}
