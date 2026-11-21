// Words and numbers for the gauge console's readout, shared by the build-time HTML, the client
// script that updates it, and the console's aria-label, so all three always say the same thing.
import { meanLift, type Correction, type GaugeRun } from "./dashboard-runs";

export const CORRECTION_LABEL: Record<Correction, string> = {
	none: "No correction",
	bonferroni: "Bonferroni",
	bh: "Benjamini-Hochberg",
};

/** Signed, with a real minus sign. */
export function formatZ(z: number): string {
	return `${z < 0 ? "−" : "+"}${Math.abs(z).toFixed(2)}`;
}

/** A relative lift as a whole percent, signed with a real minus: 0.733 -> "+73%". */
export function formatLift(lift: number): string {
	const pct = Math.round(lift * 100);
	return `${pct < 0 ? "−" : "+"}${Math.abs(pct)}%`;
}

export function formatP(p: number): string {
	if (p < 0.0001) return "<0.0001";
	return p.toFixed(4);
}

export interface CrossedMetric {
	number: number;
	is_null: boolean;
	z: number;
	p: number;
}

export interface RunReadout {
	eyebrow: string;
	mode: string;
	crossed: CrossedMetric[];
	falseCount: number;
	/** Truly lifted metrics the rule left out of the red. */
	missed: CrossedMetric[];
	/** e.g. "|z| > 1.96, so p < 0.05" */
	redline: string;
	/** Why the redline sits where it does under this rule. */
	rule: string;
	/** The winner's curse in this run: how big the real lifts in the red look, against the truth. */
	curse: string;
	/** One sentence for screen readers. */
	sentence: string;
}

export function describeRun(run: GaugeRun, mode: Correction, index: number, total: number): RunReadout {
	const line = run.redline[mode];
	const m = run.metrics.length;
	const pick = (f: (x: GaugeRun["metrics"][number]) => boolean) =>
		run.metrics.filter(f).map(({ number, is_null, z, p }) => ({ number, is_null, z, p }));
	const crossed = pick((x) => x.flagged[mode]);
	const missed = pick((x) => !x.is_null && !x.flagged[mode]);
	const falseCount = crossed.filter((c) => c.is_null).length;
	const zText = line.z.toFixed(2);
	const pText = formatP(line.p);
	const alpha = String(run.alpha);

	let redline: string;
	let rule: string;
	if (mode === "none") {
		redline = `|z| > ${zText}, so p < ${alpha}`;
		rule = `Every metric is tested on its own at ${alpha}.`;
	} else if (mode === "bonferroni") {
		redline = `|z| > ${zText}, so p < ${alpha} ÷ ${m} = ${pText}`;
		rule = `${alpha} is split evenly across all ${m} metrics.`;
	} else {
		const k = line.rank ?? 0;
		redline = `|z| ≥ ${zText}, so p ≤ ${Math.max(k, 1)}/${m} × ${alpha} = ${pText}`;
		rule =
			k > 0
				? `Sorted by p-value, the ${k} smallest clear the largest rank line they can, (rank/${m}) × ${alpha}.`
				: `Not even the smallest p-value clears its rank line, (1/${m}) × ${alpha}, so nothing is flagged.`;
	}

	const trueLift = formatLift(run.config.relative_lift);
	const lifted = run.metrics.filter((x) => !x.is_null);
	const inRed = lifted.filter((x) => x.flagged[mode]);
	const allMean = meanLift(run.metrics);
	const flaggedMean = meanLift(run.metrics, (x) => x.flagged[mode]);
	const all = allMean === null ? "" : ` (all ${lifted.length} average ${formatLift(allMean)})`;
	const curse =
		flaggedMean === null
			? `No real lift is in the red, so no winner is overstated${all}; the truth is ${trueLift}.`
			: inRed.length === 1
				? `Winner's curse: the one real lift in the red reads ${formatLift(flaggedMean)}, against a true ${trueLift}${all}.`
				: `Winner's curse: the ${inRed.length} real lifts in the red read ${formatLift(flaggedMean)} on average, against a true ${trueLift}${all}.`;

	const names = (list: CrossedMetric[]) => list.map((c) => `#${c.number}`).join(", ");
	const falseNames = names(crossed.filter((c) => c.is_null));
	const sentence =
		`Seed ${run.seed}, ${mode === "none" ? "no correction" : CORRECTION_LABEL[mode]}: ${crossed.length} of ${m} needles in the red` +
		(crossed.length ? ` (${names(crossed)})` : "") +
		(falseCount === 0
			? "; no false discoveries."
			: falseCount === 1
				? `; ${falseNames} is truly null, a false discovery.`
				: `; ${falseNames} are truly null, ${falseCount} false discoveries.`);

	return {
		eyebrow: `Run ${index + 1} of ${total} · seed ${run.seed}`,
		mode: CORRECTION_LABEL[mode],
		crossed,
		falseCount,
		missed,
		redline,
		rule,
		curse,
		sentence,
	};
}
