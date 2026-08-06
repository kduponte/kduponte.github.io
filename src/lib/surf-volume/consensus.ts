// Brief §13: transparent median consensus + uncertainty. Presentation-convention agreement
// labels, not a scientific claim — documented as such wherever agreement_label is shown.
import { AGREEMENT_THRESHOLDS } from "./taxonomy";
import type { AgreementLabel, ConsensusStats } from "./types";

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

export function agreementLabel(relativeIqr: number | null): AgreementLabel {
	if (relativeIqr === null) return "insufficient_data";
	if (relativeIqr < AGREEMENT_THRESHOLDS.high) return "high";
	if (relativeIqr < AGREEMENT_THRESHOLDS.moderate) return "moderate";
	return "low";
}

/**
 * Computes consensus stats from a set of directly-comparable point-estimate recommendations
 * (already filtered by the caller to `is_directly_comparable === true` and non-null points).
 * Never returns a fabricated 0 for missing data — returns nulls and n=0 for an empty input.
 */
export function computeConsensus(points: number[]): ConsensusStats {
	if (points.length === 0) {
		return {
			median: null,
			min: null,
			max: null,
			q25: null,
			q75: null,
			iqr: null,
			mad: null,
			relative_iqr: null,
			agreement_label: "insufficient_data",
			n_contributing_systems: 0,
		};
	}
	const med = median(points);
	const q25 = quantile(points, 0.25);
	const q75 = quantile(points, 0.75);
	const iqr = q75 - q25;
	const relativeIqr = med !== 0 ? iqr / med : null;
	return {
		median: med,
		min: Math.min(...points),
		max: Math.max(...points),
		q25,
		q75,
		iqr,
		mad: medianAbsoluteDeviation(points),
		relative_iqr: relativeIqr,
		agreement_label: agreementLabel(relativeIqr),
		n_contributing_systems: points.length,
	};
}
