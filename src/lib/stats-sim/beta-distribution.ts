// Closed-form Beta distribution primitives, used only for drawing the prior/data/posterior curves
// in the prior playground. Everything else this page needs from a Beta posterior (its mean, samples
// from it) already lives in bayesian.ts; charting the distribution itself needs its density function,
// which doesn't exist there yet.

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
	0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
	12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log(Gamma(x)), via the Lanczos approximation (accurate to ~15 digits for x > 0.5, extended to
 * x <= 0.5 via the reflection formula Gamma(x)Gamma(1-x) = pi / sin(pi*x)). */
export function logGamma(x: number): number {
	if (x < 0.5) {
		return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
	}
	const shifted = x - 1;
	let a = LANCZOS_COEFFICIENTS[0];
	const t = shifted + LANCZOS_G + 0.5;
	for (let i = 1; i < LANCZOS_G + 2; i++) {
		a += LANCZOS_COEFFICIENTS[i] / (shifted + i);
	}
	return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Beta(alpha, beta) probability density at x, computed in log-space for stability at the large
 * pseudo-count values this page uses (alpha/beta up to a few hundred). Returns 0 outside (0, 1). */
export function betaPdf(x: number, alpha: number, beta: number): number {
	if (alpha <= 0 || beta <= 0) throw new Error(`betaPdf requires alpha > 0 and beta > 0, got alpha=${alpha}, beta=${beta}`);
	if (x <= 0 || x >= 1) return 0;
	const logNormalizer = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);
	const logDensity = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logNormalizer;
	return Math.exp(logDensity);
}
