// Brief §16E: an interpretable explanatory model, secondary to the median consensus — never
// the primary recommendation. OLS with source fixed effects, hand-rolled (small design matrix,
// ~15-20 columns over the Dataset A core grid) rather than pulling in a stats dependency.
// Confidence intervals come from a case-resampling bootstrap rather than analytic standard
// errors, to avoid implementing a t-distribution by hand — the riskier piece to get right.
import type { Observation, RegressionOutput, Skill } from "./types";

type Matrix = number[][];

function transpose(m: Matrix): Matrix {
	return m[0].map((_, col) => m.map((row) => row[col]));
}

function multiply(a: Matrix, b: Matrix): Matrix {
	const result: Matrix = Array.from({ length: a.length }, () => new Array(b[0].length).fill(0));
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b[0].length; j++) {
			let sum = 0;
			for (let k = 0; k < b.length; k++) sum += a[i][k] * b[k][j];
			result[i][j] = sum;
		}
	}
	return result;
}

/** Gauss-Jordan matrix inversion. Throws on a singular matrix (e.g. a source with only 1 obs). */
function invert(m: Matrix): Matrix {
	const n = m.length;
	const aug: Matrix = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		for (let row = col + 1; row < n; row++) {
			if (Math.abs(aug[row][col]) > Math.abs(aug[pivotRow][col])) pivotRow = row;
		}
		if (Math.abs(aug[pivotRow][col]) < 1e-10) {
			throw new Error("Regression design matrix is singular — insufficient variation to fit (check source dummy collinearity).");
		}
		[aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
		const pivot = aug[col][col];
		for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
		for (let row = 0; row < n; row++) {
			if (row === col) continue;
			const factor = aug[row][col];
			for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
		}
	}
	return aug.map((row) => row.slice(n));
}

export interface RegressionRow {
	weight_kg: number;
	skill_normalized: Skill;
	source_id: string;
	recommended_volume_point_l: number;
}

export function buildDesignMatrix(rows: RegressionRow[], sourceIds: string[], referenceSourceId: string) {
	const meanWeight = rows.reduce((s, r) => s + r.weight_kg, 0) / rows.length;
	const otherSources = sourceIds.filter((s) => s !== referenceSourceId);
	const terms = [
		"intercept",
		"weight_kg_centered",
		"skill_intermediate",
		"skill_advanced",
		"weight_kg_centered:skill_intermediate",
		"weight_kg_centered:skill_advanced",
		...otherSources.map((s) => `source_${s}`),
	];

	const X: Matrix = rows.map((r) => {
		const wc = r.weight_kg - meanWeight;
		const isInt = r.skill_normalized === "intermediate" ? 1 : 0;
		const isAdv = r.skill_normalized === "advanced" ? 1 : 0;
		const sourceDummies = otherSources.map((s) => (r.source_id === s ? 1 : 0));
		return [1, wc, isInt, isAdv, wc * isInt, wc * isAdv, ...sourceDummies];
	});
	const y: Matrix = rows.map((r) => [r.recommended_volume_point_l]);

	return { X, y, terms, meanWeight };
}

function solveOLS(X: Matrix, y: Matrix): number[] {
	const Xt = transpose(X);
	const XtX = multiply(Xt, X);
	const XtY = multiply(Xt, y);
	const XtXInv = invert(XtX);
	return multiply(XtXInv, XtY).map((row) => row[0]);
}

function predict(X: Matrix, beta: number[]): number[] {
	return X.map((row) => row.reduce((sum, x, i) => sum + x * beta[i], 0));
}

function rSquared(y: number[], yHat: number[]): number {
	const meanY = y.reduce((a, b) => a + b, 0) / y.length;
	const ssRes = y.reduce((sum, yi, i) => sum + (yi - yHat[i]) ** 2, 0);
	const ssTot = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0);
	return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/** Mulberry32 — small, deterministic PRNG so the bootstrap/CV are reproducible across runs. */
function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function kFoldCvRmse(rows: RegressionRow[], sourceIds: string[], referenceSourceId: string, k: number, seed: number): number {
	const rng = mulberry32(seed);
	const indices = rows.map((_, i) => i);
	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[indices[i], indices[j]] = [indices[j], indices[i]];
	}
	const folds: number[][] = Array.from({ length: k }, () => []);
	indices.forEach((idx, i) => folds[i % k].push(idx));

	const squaredErrors: number[] = [];
	for (let fold = 0; fold < k; fold++) {
		const testIdx = new Set(folds[fold]);
		const trainRows = rows.filter((_, i) => !testIdx.has(i));
		const testRows = rows.filter((_, i) => testIdx.has(i));
		if (trainRows.length < sourceIds.length + 6 || testRows.length === 0) continue; // not enough to fit this fold
		try {
			const { X, y } = buildDesignMatrix(trainRows, sourceIds, referenceSourceId);
			const beta = solveOLS(X, y);
			const { X: testX } = buildDesignMatrix(testRows, sourceIds, referenceSourceId);
			const preds = predict(testX, beta);
			testRows.forEach((r, i) => squaredErrors.push((r.recommended_volume_point_l - preds[i]) ** 2));
		} catch {
			continue; // singular fold (rare with small k on this dataset size) — skip rather than fail the whole CV
		}
	}
	if (squaredErrors.length === 0) return NaN;
	return Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length);
}

export function fitRegression(observations: Observation[], referenceSourceId: string, bootstrapReps = 1000, seed = 42): RegressionOutput {
	const rows: RegressionRow[] = observations
		.filter((o) => o.is_directly_comparable && o.recommended_volume_point_l !== null && o.profile_id.startsWith("core_"))
		.map((o) => ({
			weight_kg: o.weight_kg,
			skill_normalized: o.skill_normalized,
			source_id: o.source_id,
			recommended_volume_point_l: o.recommended_volume_point_l as number,
		}));

	if (rows.length === 0) {
		return { coefficients: [], r_squared: 0, cv_rmse: NaN, residuals_by_source: [], n_observations: 0, notes: ["No comparable Dataset A observations available yet."] };
	}

	const sourceIds = Array.from(new Set(rows.map((r) => r.source_id))).sort();
	const { X, y, terms } = buildDesignMatrix(rows, sourceIds, referenceSourceId);
	const beta = solveOLS(X, y);
	const yHat = predict(X, beta);
	const yFlat = y.map((r) => r[0]);
	const r2 = rSquared(yFlat, yHat);

	const rng = mulberry32(seed);
	const bootstrapEstimates: number[][] = terms.map(() => []);
	for (let rep = 0; rep < bootstrapReps; rep++) {
		const resampled = Array.from({ length: rows.length }, () => rows[Math.floor(rng() * rows.length)]);
		try {
			const { X: Xb, y: yb } = buildDesignMatrix(resampled, sourceIds, referenceSourceId);
			const betaB = solveOLS(Xb, yb);
			betaB.forEach((b, i) => bootstrapEstimates[i].push(b));
		} catch {
			continue; // a resample lacking full source/skill variation is discarded, not fatal
		}
	}

	const coefficients = terms.map((term, i) => {
		const estimates = [...bootstrapEstimates[i]].sort((a, b) => a - b);
		const ciLow = estimates.length > 0 ? estimates[Math.floor(0.025 * estimates.length)] : beta[i];
		const ciHigh = estimates.length > 0 ? estimates[Math.min(estimates.length - 1, Math.floor(0.975 * estimates.length))] : beta[i];
		return { term, estimate: beta[i], ci_low: ciLow, ci_high: ciHigh };
	});

	const residualsBySource = sourceIds.map((sourceId) => {
		const idxs = rows.map((r, i) => (r.source_id === sourceId ? i : -1)).filter((i) => i >= 0);
		const residuals = idxs.map((i) => yFlat[i] - yHat[i]);
		return {
			source_id: sourceId,
			mean_residual: residuals.reduce((a, b) => a + b, 0) / residuals.length,
			rmse: Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / residuals.length),
		};
	});

	const cvRmse = kFoldCvRmse(rows, sourceIds, referenceSourceId, 5, seed);

	return {
		coefficients,
		r_squared: r2,
		cv_rmse: cvRmse,
		residuals_by_source: residualsBySource,
		n_observations: rows.length,
		notes: [
			`Reference source: ${referenceSourceId}. Reference skill: beginner.`,
			"This is an explanatory lens over the core comparison grid, not the primary consensus calculator.",
			"Confidence intervals are 1000-rep case-resampling bootstrap percentile intervals, not analytic standard errors.",
		],
	};
}
