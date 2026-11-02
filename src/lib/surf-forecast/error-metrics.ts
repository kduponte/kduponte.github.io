// Forecast error metrics.
//
// The decomposition at the centre of this file answers the project's third question (is a source
// biased, or just noisy?) exactly rather than by eye:
//
//     RMSE^2 = bias^2 + centered_RMSE^2
//
// Bias is the constant offset: the part a surfer can correct for once they know it ("this one
// always reads a foot high"). Centered RMSE is the scatter left over after that offset is removed:
// the part nobody can correct for. Two sources with the same RMSE can be completely different
// animals, one consistently wrong and one erratically wrong, and only this split tells them apart.
// The identity is exact for linear variables, which the tests pin.
//
// Direction is circular, so it gets its own path: a forecast of 350 degrees against an observed 10
// is 20 degrees off, not 340, and errors of +170 and -170 average to 180, not to zero. A naive mean
// would report that second case as a perfectly unbiased forecast.
import { circularMeanDeg, signedAngularDifferenceDeg } from "./angles";

export type ErrorKind = "linear" | "circular";

export interface ErrorSummary {
	n: number;
	/** Mean signed error, forecast minus observed. A circular mean for direction; null when the
	 * errors are spread so evenly around the compass that no mean direction exists. */
	bias: number | null;
	mae: number | null;
	rmse: number | null;
	/** Standard deviation of the errors: what remains of RMSE after the constant offset. */
	centered_rmse: number | null;
	/** Pearson correlation between forecast and observed. Linear variables only. */
	correlation: number | null;
	/** MAE as a share of the mean observed value, so a 30 cm miss on a 3 m day and on a 50 cm day
	 * stop looking identical. Linear, positive-valued variables only. */
	relative_mae: number | null;
	/** Fraction of pairs whose absolute error is within the variable's tolerance. */
	share_within: number | null;
}

function mean(xs: number[]): number {
	let s = 0;
	for (const x of xs) s += x;
	return s / xs.length;
}

/** Signed errors, forecast minus observed, wrapped to [-180, 180) for direction. */
export function signedErrors(forecast: number[], observed: number[], kind: ErrorKind): number[] {
	if (forecast.length !== observed.length) {
		throw new Error(`forecast and observed lengths differ: ${forecast.length} vs ${observed.length}`);
	}
	return forecast.map((f, i) => (kind === "circular" ? signedAngularDifferenceDeg(f, observed[i]) : f - observed[i]));
}

/** Circular mean of signed angular errors, expressed in [-180, 180). */
function circularBias(errors: number[]): number | null {
	const m = circularMeanDeg(errors, 1e-6);
	if (m === null) return null;
	return m >= 180 ? m - 360 : m;
}

export function pearson(xs: number[], ys: number[]): number | null {
	const n = xs.length;
	if (n < 3 || n !== ys.length) return null;
	const mx = mean(xs);
	const my = mean(ys);
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - mx;
		const dy = ys[i] - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	if (sxx === 0 || syy === 0) return null;
	return sxy / Math.sqrt(sxx * syy);
}

export function meanSquaredError(errors: number[]): number | null {
	if (errors.length === 0) return null;
	let s = 0;
	for (const e of errors) s += e * e;
	return s / errors.length;
}

export function summarizeErrors(
	forecast: number[],
	observed: number[],
	kind: ErrorKind,
	tolerance: number,
): ErrorSummary {
	const n = forecast.length;
	if (n === 0) {
		return {
			n: 0,
			bias: null,
			mae: null,
			rmse: null,
			centered_rmse: null,
			correlation: null,
			relative_mae: null,
			share_within: null,
		};
	}

	const errors = signedErrors(forecast, observed, kind);
	const absErrors = errors.map(Math.abs);
	const mae = mean(absErrors);
	const rmse = Math.sqrt(meanSquaredError(errors) ?? 0);
	const shareWithin = absErrors.filter((e) => e <= tolerance).length / n;

	if (kind === "circular") {
		const bias = circularBias(errors);
		// With no mean direction there is no offset to remove, so all of the RMSE is scatter.
		const centered =
			bias === null
				? rmse
				: Math.sqrt(mean(errors.map((e) => signedAngularDifferenceDeg(e, bias) ** 2)));
		return {
			n,
			bias,
			mae,
			rmse,
			centered_rmse: centered,
			correlation: null,
			relative_mae: null,
			share_within: shareWithin,
		};
	}

	const bias = mean(errors);
	const centered = Math.sqrt(mean(errors.map((e) => (e - bias) ** 2)));
	const meanObserved = mean(observed);
	return {
		n,
		bias,
		mae,
		rmse,
		centered_rmse: centered,
		correlation: pearson(forecast, observed),
		relative_mae: meanObserved > 0 ? mae / meanObserved : null,
		share_within: shareWithin,
	};
}

/**
 * MSE skill score against a reference forecast: 1 - MSE_model / MSE_reference. Positive means the
 * model beats the reference, zero means it ties, negative means the reference was better. Null
 * when the reference is perfect, since nothing can be measured against zero error.
 *
 * Both MSEs must come from the same set of valid times. Scoring a model on one set of hours and
 * the reference on another compares the weather, not the forecasts.
 */
export function mseSkillScore(mseModel: number | null, mseReference: number | null): number | null {
	if (mseModel === null || mseReference === null || mseReference === 0) return null;
	return 1 - mseModel / mseReference;
}
