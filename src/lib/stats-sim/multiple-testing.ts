// Corrections for testing many p-values at once. Naive (no correction) lets the family-wise error
// rate, P(at least one false rejection), climb toward 1-(1-alpha)^m as the number of tests m grows.
// Bonferroni tests each hypothesis at alpha/m instead, which controls the family-wise error rate at
// exactly alpha regardless of m, at the cost of power. Benjamini-Hochberg controls a different,
// usually more useful quantity, the expected false discovery rate (the expected proportion of
// rejections that are false, not the probability of any false rejection at all), which is why it
// keeps more power than Bonferroni as m grows, see multiple-testing.test.ts for both properties
// confirmed by direct Monte Carlo simulation.

/** Bonferroni's per-test threshold: alpha divided evenly across all m tests. */
export function bonferroniThreshold(alpha: number, numTests: number): number {
	if (numTests <= 0) throw new Error(`bonferroniThreshold requires numTests > 0, got ${numTests}`);
	return alpha / numTests;
}

/** No correction at all: reject whichever p-values individually fall under alpha. The naive
 * baseline every correction exists to fix. */
export function naiveRejections(pValues: number[], alpha: number): boolean[] {
	return pValues.map((p) => p < alpha);
}

/** Bonferroni: reject whichever p-values fall under alpha/m. */
export function bonferroniRejections(pValues: number[], alpha: number): boolean[] {
	const threshold = bonferroniThreshold(alpha, pValues.length);
	return pValues.map((p) => p < threshold);
}

/**
 * Benjamini-Hochberg step-up procedure: sort p-values ascending, find the LARGEST rank k such that
 * the k-th smallest p-value is <= (k/m)*alpha, then reject every hypothesis among those k smallest,
 * not just the ones individually below alpha/m. Returns rejections in the ORIGINAL input order.
 */
export function benjaminiHochberg(pValues: number[], alpha: number): boolean[] {
	const m = pValues.length;
	if (m === 0) return [];

	const indexed = pValues.map((p, originalIndex) => ({ p, originalIndex }));
	indexed.sort((a, b) => a.p - b.p);

	let cutoffRank = 0; // 0 means "reject nothing"
	for (let rank = 1; rank <= m; rank++) {
		const threshold = (rank / m) * alpha;
		if (indexed[rank - 1].p <= threshold) cutoffRank = rank;
	}

	const rejections = new Array(m).fill(false);
	for (let rank = 0; rank < cutoffRank; rank++) {
		rejections[indexed[rank].originalIndex] = true;
	}
	return rejections;
}
