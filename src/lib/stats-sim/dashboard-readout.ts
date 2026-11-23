// Words and numbers for the launch dashboard's tally, shared by the build-time HTML and the client
// script that updates it, so both always say the same thing.
import { meanLift, type Correction, type DashboardMetric, type DashboardRun } from "./dashboard-runs";

export const CORRECTION_LABEL: Record<Correction, string> = {
	none: "No correction",
	bonferroni: "Bonferroni",
	bh: "Benjamini-Hochberg",
};

/** Signed, with a real minus sign. */
export function formatZ(z: number): string {
	return `${z < 0 ? "−" : "+"}${Math.abs(z).toFixed(2)}`;
}

/** A relative lift as a whole percent, signed with a real minus: 0.733 -> "+73%"; one that rounds to zero is "0%". */
export function formatLift(lift: number): string {
	const pct = Math.round(lift * 100);
	if (pct === 0) return "0%";
	return `${pct < 0 ? "−" : "+"}${Math.abs(pct)}%`;
}

export function formatP(p: number): string {
	if (p < 0.0001) return "<0.0001";
	return p.toFixed(4);
}

/** "A", "A and B", "A, B and C". */
export function listNames(names: string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface RunReadout {
	/** e.g. "Run 1 of 20 · seed 1" */
	eyebrow: string;
	mode: string;
	/** The metrics that cleared the bar under this rule. */
	cleared: DashboardMetric[];
	up: number;
	down: number;
	/** What the dashboard claims, before the truth: "6 of 20 metrics cleared the bar: 5 up, 1 down." */
	headline: string;
	/** e.g. "p < 0.05 (|z| > 1.96)" */
	bar: string;
	/** Why the bar sits where it does under this rule. */
	rule: string;
	/** Revealed: how many that cleared were truly null. */
	falseCount: number;
	/** Revealed: which cleared metrics never moved. */
	truth: string;
	/** Revealed: the winner's curse in this run, the real lifts that cleared against the truth. */
	curse: string;
	/** Revealed: truly lifted metrics the bar left out. */
	missed: DashboardMetric[];
	missedLine: string;
}

export function describeRun(run: DashboardRun, mode: Correction, index: number, total: number): RunReadout {
	const bar = run.bar[mode];
	const m = run.metrics.length;
	const cleared = run.metrics.filter((x) => x.flagged[mode]);
	const up = cleared.filter((x) => x.z > 0).length;
	const down = cleared.length - up;
	const falses = cleared.filter((x) => x.is_null);
	const missed = run.metrics.filter((x) => !x.is_null && !x.flagged[mode]);
	const zText = bar.z.toFixed(2);
	const pText = formatP(bar.p);
	const alpha = String(run.alpha);
	const named = (list: DashboardMetric[]) => listNames(list.map((x) => `${x.name} (${x.lift === null ? "n/a" : formatLift(x.lift)})`));

	let barText: string;
	let rule: string;
	if (mode === "none") {
		barText = `p < ${alpha} (|z| > ${zText})`;
		rule = `Every metric is tested on its own at ${alpha}.`;
	} else if (mode === "bonferroni") {
		barText = `p < ${alpha} ÷ ${m} = ${pText} (|z| > ${zText})`;
		rule = `${alpha} is split evenly across all ${m} metrics.`;
	} else {
		const k = bar.rank ?? 0;
		barText = `p ≤ ${Math.max(k, 1)}/${m} × ${alpha} = ${pText} (|z| ≥ ${zText})`;
		rule =
			k > 0
				? `Sorted by p-value, the ${k} smallest clear the largest rank line they can, (rank/${m}) × ${alpha}.`
				: `Not even the smallest p-value clears its rank line, (1/${m}) × ${alpha}, so nothing clears the bar.`;
	}

	const headline =
		cleared.length === 0
			? `None of the ${m} metrics cleared the bar.`
			: cleared.length === 1
				? `1 of ${m} metrics cleared the bar, and it went ${up ? "up" : "down"}.`
				: `${cleared.length} of ${m} metrics cleared the bar: ${down === 0 ? "all up" : up === 0 ? "all down" : `${up} up, ${down} down`}.`;

	const truth =
		cleared.length === 0
			? "Nothing cleared the bar, so there are no false discoveries."
			: falses.length === 0
				? cleared.length === 1
					? "No false discoveries: the one metric that cleared the bar truly moved."
					: cleared.length === 2
						? "No false discoveries: both metrics that cleared the bar truly moved."
						: `No false discoveries: all ${cleared.length} metrics that cleared the bar truly moved.`
				: falses.length === 1
					? `1 false discovery: ${named(falses)} never truly moved.`
					: `${falses.length} false discoveries: ${named(falses)} never truly moved.`;

	const trueLift = formatLift(run.config.relative_lift);
	const lifted = run.metrics.filter((x) => !x.is_null);
	const realCleared = lifted.filter((x) => x.flagged[mode]);
	const allMean = meanLift(run.metrics);
	const flaggedMean = meanLift(run.metrics, (x) => x.flagged[mode]);
	const all = allMean === null ? "" : ` (all ${lifted.length} real lifts average ${formatLift(allMean)})`;
	const curse =
		flaggedMean === null
			? `No real lift cleared the bar, so none is overstated${all}; the truth is ${trueLift}.`
			: realCleared.length === 1
				? `Winner's curse: the one real lift that cleared the bar reads ${formatLift(flaggedMean)}, against a true ${trueLift}${all}.`
				: `Winner's curse: the ${realCleared.length} real lifts that cleared the bar read ${formatLift(flaggedMean)} on average, against a true ${trueLift}${all}.`;

	const missedLine = missed.length ? `Real lifts the bar missed: ${named(missed)}.` : "The bar caught every real lift.";

	return {
		eyebrow: `Run ${index + 1} of ${total} · seed ${run.seed}`,
		mode: CORRECTION_LABEL[mode],
		cleared,
		up,
		down,
		headline,
		bar: barText,
		rule,
		falseCount: falses.length,
		truth,
		curse,
		missed,
		missedLine,
	};
}
