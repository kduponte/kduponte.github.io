// Aggregation: grouped error summaries, skill against persistence, and paired comparisons.
import { meanSquaredError, mseSkillScore, signedErrors, summarizeErrors, type ErrorKind, type ErrorSummary } from "./error-metrics";
import type { PairRow, Variable } from "./pairs";

export interface VariableConfig {
	kind: ErrorKind;
	/** The "close enough" band for share_within, in the variable's own unit. */
	tolerance: number;
	unit: string;
	label: string;
	/** Plain-language reading of the tolerance, for the page. */
	tolerance_label: string;
}

export const VARIABLE_CONFIG: Record<Variable, VariableConfig> = {
	wave_height: {
		kind: "linear",
		// Exactly one foot, because that is the unit a surfer actually checks a forecast in.
		tolerance: 0.3048,
		unit: "m",
		label: "Wave height",
		tolerance_label: "within a foot",
	},
	wave_period: {
		kind: "linear",
		tolerance: 2,
		unit: "s",
		label: "Wave period",
		tolerance_label: "within 2 seconds",
	},
	wave_direction: {
		kind: "circular",
		// One point of a 16-point compass: the difference between a west and a west-northwest swell.
		tolerance: 22.5,
		unit: "°",
		label: "Wave direction",
		tolerance_label: "within one compass point",
	},
};

export function summarize(rows: PairRow[], variable: Variable): ErrorSummary {
	const cfg = VARIABLE_CONFIG[variable];
	return summarizeErrors(
		rows.map((r) => r.forecast),
		rows.map((r) => r.observed),
		cfg.kind,
		cfg.tolerance,
	);
}

/** Groups rows by a key and summarises each group. Rows in one group must share a variable. */
export function groupSummaries(rows: PairRow[], keyOf: (r: PairRow) => string): Map<string, { variable: Variable; summary: ErrorSummary }> {
	const groups = new Map<string, PairRow[]>();
	for (const r of rows) {
		const k = keyOf(r);
		const g = groups.get(k);
		if (g) g.push(r);
		else groups.set(k, [r]);
	}
	const out = new Map<string, { variable: Variable; summary: ErrorSummary }>();
	for (const [k, g] of groups) {
		const variable = g[0].variable;
		if (g.some((r) => r.variable !== variable)) throw new Error(`group ${k} mixes variables`);
		out.set(k, { variable, summary: summarize(g, variable) });
	}
	return out;
}

/** Identity of one forecast target: a station, a valid hour, a variable and a lead. */
export function targetKey(r: Pick<PairRow, "station" | "valid_time" | "variable" | "lead_days">): string {
	return `${r.station}|${r.valid_time}|${r.variable}|${r.lead_days}`;
}

/** Squared persistence error per target, for joining against model rows. */
export function persistenceIndex(rows: PairRow[]): Map<string, number> {
	const index = new Map<string, number>();
	for (const r of rows) {
		if (r.source !== "persistence") continue;
		const [e] = signedErrors([r.forecast], [r.observed], VARIABLE_CONFIG[r.variable].kind);
		index.set(targetKey(r), e * e);
	}
	return index;
}

export interface SkillResult {
	/** Targets where both the model and persistence have a pair. */
	n: number;
	mse_model: number | null;
	mse_persistence: number | null;
	skill: number | null;
}

/**
 * MSE skill against persistence, scored only on targets both have. Without that restriction a
 * model and the baseline get judged on different hours, and the score ends up measuring which of
 * them happened to be evaluated during the calmer weeks.
 */
export function skillAgainstPersistence(modelRows: PairRow[], index: Map<string, number>): SkillResult {
	const modelSq: number[] = [];
	const persistSq: number[] = [];
	for (const r of modelRows) {
		if (r.source === "persistence") continue;
		const p = index.get(targetKey(r));
		if (p === undefined) continue;
		const [e] = signedErrors([r.forecast], [r.observed], VARIABLE_CONFIG[r.variable].kind);
		modelSq.push(e * e);
		persistSq.push(p);
	}
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
	const mseModel = mean(modelSq);
	const msePersist = mean(persistSq);
	return { n: modelSq.length, mse_model: mseModel, mse_persistence: msePersist, skill: mseSkillScore(mseModel, msePersist) };
}

/**
 * Paired absolute-error differences between two sources, |error A| - |error B|, grouped by UTC
 * calendar day in chronological order, ready for the block bootstrap. Positive means A missed by
 * more. Only targets both sources forecast are compared, and every station's pairs for a day share
 * one group, since one weather system moves through neighbouring buoys together.
 */
export function pairedAbsDifferencesByDay(rowsA: PairRow[], rowsB: PairRow[]): number[][] {
	const errB = new Map<string, number>();
	for (const r of rowsB) {
		const [e] = signedErrors([r.forecast], [r.observed], VARIABLE_CONFIG[r.variable].kind);
		errB.set(targetKey(r), Math.abs(e));
	}
	const byDay = new Map<string, number[]>();
	for (const r of rowsA) {
		const b = errB.get(targetKey(r));
		if (b === undefined) continue;
		const [e] = signedErrors([r.forecast], [r.observed], VARIABLE_CONFIG[r.variable].kind);
		const day = r.valid_time.slice(0, 10);
		const list = byDay.get(day);
		if (list) list.push(Math.abs(e) - b);
		else byDay.set(day, [Math.abs(e) - b]);
	}
	return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
}

export { meanSquaredError };
