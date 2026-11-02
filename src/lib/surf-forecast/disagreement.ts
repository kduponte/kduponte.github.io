// Does disagreement between forecasting systems predict error?
//
// The practical question behind it: a surfer checking several forecasts sees them disagree, and
// wants to know whether that disagreement means anything. At the buoys both halves are measurable,
// so the relationship can be tested directly, and where it holds, spread becomes a usable warning
// light at the breaks that have no buoy at all.
//
// The trap is confounding by location. A sheltered buoy has large spread (one coarse model reads
// swell the island blocks) and large error for the same reason, so pooling every station would
// show spread "predicting" error even if, at any single buoy, it predicted nothing. So spread is
// ranked within each station before binning: the question becomes "on this buoy's high-spread
// days, is the forecast worse than on its own low-spread days?"

export interface DisagreementPoint {
	station: string;
	/** Range of the systems' forecasts for one target: max minus min. */
	spread: number;
	/** Absolute error of the forecast being judged on that target. */
	abs_error: number;
}

export interface SpreadBin {
	/** 0 is each station's lowest-spread fifth (or whatever fraction nBins gives). */
	bin: number;
	n: number;
	mean_spread: number;
	mae: number;
}

export function spreadOf(values: number[]): number {
	if (values.length === 0) throw new Error("spreadOf() called with no values");
	return Math.max(...values) - Math.min(...values);
}

/**
 * Bins points by spread rank within their own station, then pools each bin across stations. A
 * station with fewer points than bins is skipped, since it cannot fill every bin.
 */
export function binByWithinStationSpread(points: DisagreementPoint[], nBins = 5): SpreadBin[] {
	const byStation = new Map<string, DisagreementPoint[]>();
	for (const p of points) {
		const list = byStation.get(p.station);
		if (list) list.push(p);
		else byStation.set(p.station, [p]);
	}

	const acc = Array.from({ length: nBins }, () => ({ n: 0, spread: 0, error: 0 }));
	for (const list of byStation.values()) {
		if (list.length < nBins) continue;
		const sorted = [...list].sort((a, b) => a.spread - b.spread);
		sorted.forEach((p, rank) => {
			const bin = Math.min(nBins - 1, Math.floor((rank * nBins) / sorted.length));
			acc[bin].n++;
			acc[bin].spread += p.spread;
			acc[bin].error += p.abs_error;
		});
	}

	return acc
		.map((a, bin) => ({ bin, n: a.n, mean_spread: a.n ? a.spread / a.n : 0, mae: a.n ? a.error / a.n : 0 }))
		.filter((b) => b.n > 0);
}

export interface SpreadDecomposition {
	n: number;
	/** Median range of the systems' forecasts across all targets. */
	median_range: number;
	/** 90th percentile of the range: how bad the disagreement gets on the worst tenth of days. */
	p90_range: number;
	/**
	 * Range of the systems' long-run averages at this spot: disagreement that never goes away,
	 * which at a buoy turned out to mean a model that cannot see the spot's sheltering.
	 */
	systematic: number;
	/** Median range after removing each system's own average: disagreement about the day. */
	daily_median: number;
	/** Mean of all forecasts, so a spread can be read against the size of the surf. */
	mean_forecast: number;
	/** Each system's long-run average, in the order the targets list them. */
	system_means: number[];
	/** Index of the system whose average sits farthest from the average of the others. */
	outlier: number;
}

function quantileSorted(sorted: number[], q: number): number {
	if (sorted.length === 1) return sorted[0];
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Splits forecast disagreement at one spot into a persistent part and a day-to-day part, the
 * same way the bias section splits error. Each target is one hour's forecasts, one per system, in
 * a fixed system order. Targets with a different number of forecasts are rejected rather than
 * silently mixed, since a range over two systems is not comparable with a range over three.
 */
export function decomposeSpread(targets: number[][]): SpreadDecomposition | null {
	if (targets.length === 0) return null;
	const k = targets[0].length;
	if (k < 2) throw new Error("need at least two systems to measure disagreement");
	if (targets.some((t) => t.length !== k)) throw new Error("every target must carry one forecast per system");

	const n = targets.length;
	const means = Array.from({ length: k }, (_, s) => targets.reduce((acc, t) => acc + t[s], 0) / n);
	const ranges = targets.map(spreadOf).sort((a, b) => a - b);
	const daily = targets.map((t) => spreadOf(t.map((v, s) => v - means[s]))).sort((a, b) => a - b);

	const total = means.reduce((a, b) => a + b, 0);
	const distance = means.map((m) => Math.abs(m - (total - m) / (k - 1)));
	const outlier = distance.indexOf(Math.max(...distance));

	return {
		n,
		median_range: quantileSorted(ranges, 0.5),
		p90_range: quantileSorted(ranges, 0.9),
		systematic: spreadOf(means),
		daily_median: quantileSorted(daily, 0.5),
		mean_forecast: total / k,
		system_means: means,
		outlier,
	};
}
