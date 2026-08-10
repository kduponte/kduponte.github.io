// An "always-valid" test built from a genuine Bayes factor, a mixture likelihood ratio over a
// prior on the unknown effect size, rather than a raw posterior-probability threshold. Unlike
// P(B beats A) crossing a fixed number (see bayesian.ts), this quantity is a nonnegative
// martingale under the null by construction, which gives a real theorem (Ville's inequality):
// P(sup_t Λ_t >= 1/alpha | H0) <= alpha, for ANY stopping rule, including "act the first time it
// crosses." That is the actual mechanism behind Johari/Pekelis/Walsh's "always-valid p-values"
// (the basis for Optimizely's Stats Engine) and the specific, narrow thing Rouder (2014) was
// right about: real Bayes factors, not posterior-probability thresholds. See the published
// page's Methodology section for the full derivation and citations.
//
// Derivation sketch: for an estimated effect delta_hat ~ Normal(delta, V), the likelihood ratio
// under a simple alternative "true effect = delta" is LR(delta) = exp(delta_hat*delta/V - delta^2/2V).
// Mixing over delta ~ Normal(0, tau^2) (a Gaussian integral with a closed form) gives:
//   Lambda = sqrt(V / (V + tau^2)) * exp( delta_hat^2 * tau^2 / (2*V*(V + tau^2)) )

/** Mixture Bayes factor (likelihood ratio) for an observed effect estimate delta_hat with
 * sampling variance `variance`, mixed over a Normal(0, tau2) prior on the true effect. */
export function alwaysValidLikelihoodRatio(deltaHat: number, variance: number, tau2: number): number {
	if (variance <= 0) throw new Error(`alwaysValidLikelihoodRatio requires variance > 0, got ${variance}`);
	if (tau2 <= 0) throw new Error(`alwaysValidLikelihoodRatio requires tau2 > 0, got ${tau2}`);
	const denom = variance + tau2;
	return Math.sqrt(variance / denom) * Math.exp((deltaHat * deltaHat * tau2) / (2 * variance * denom));
}

/** The "always-valid p-value": min(1, 1/Lambda). Reject (declare a winner) when this is <= alpha. */
export function alwaysValidPValue(likelihoodRatio: number): number {
	return Math.min(1, 1 / likelihoodRatio);
}

/**
 * A reasonable default tau^2 (the mixing variance, "how large an effect this test is tuned to
 * detect efficiently") derived from the baseline rate rather than exposed as its own control:
 * tau = relativeEffectSize * baselineRate tunes the test to be well-powered around a lift of
 * roughly that relative size. This is a real design choice (a narrower tau detects small effects
 * faster but is less sensitive to large ones, and vice versa) documented here rather than hidden.
 */
export function defaultTau2(baselineRate: number, relativeEffectSize = 0.3): number {
	const tau = Math.max(1e-6, relativeEffectSize * Math.abs(baselineRate));
	return tau * tau;
}

export interface AlwaysValidTest {
	delta_hat: number;
	variance: number | null;
	likelihood_ratio: number | null;
	p_value: number | null;
}

/**
 * Convenience wrapper matching twoProportionZTest's shape/null-handling convention: takes raw
 * per-arm success/trial counts (as already tracked everywhere else in this project) and an
 * unpooled variance estimate of the rate difference, since the always-valid construction needs
 * the actual sampling variance at each look, not a null-pooled one.
 */
export function alwaysValidTest(successesA: number, trialsA: number, successesB: number, trialsB: number, tau2: number): AlwaysValidTest {
	const rateA = trialsA > 0 ? successesA / trialsA : 0;
	const rateB = trialsB > 0 ? successesB / trialsB : 0;
	const deltaHat = rateB - rateA;
	if (trialsA === 0 || trialsB === 0) return { delta_hat: deltaHat, variance: null, likelihood_ratio: null, p_value: null };

	const variance = (rateA * (1 - rateA)) / trialsA + (rateB * (1 - rateB)) / trialsB;
	if (variance <= 0) return { delta_hat: deltaHat, variance: null, likelihood_ratio: null, p_value: null };

	const likelihoodRatio = alwaysValidLikelihoodRatio(deltaHat, variance, tau2);
	return { delta_hat: deltaHat, variance, likelihood_ratio: likelihoodRatio, p_value: alwaysValidPValue(likelihoodRatio) };
}
