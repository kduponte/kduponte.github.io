import type { RecommendationStatus } from "./types";

export function formatLiters(value: number | null, digits = 1): string {
	if (value === null) return "—";
	return `${value.toFixed(digits)} L`;
}

export function formatRatio(value: number | null, digits = 2): string {
	if (value === null) return "—";
	return `${value.toFixed(digits)} L/kg`;
}

export function formatDeviationPct(value: number | null, digits = 0): string {
	if (value === null) return "—";
	const pct = (value * 100).toFixed(digits);
	return value > 0 ? `+${pct}%` : `${pct}%`;
}

export const STATUS_LABEL: Record<RecommendationStatus, string> = {
	observed: "Observed",
	derived: "Derived",
	interpolated: "Interpolated",
	community_heuristic: "Heuristic",
	unavailable: "Unavailable",
};

export function formatWeight(lb: number): string {
	return `${lb} lb`;
}
