// Repeated-trials study: run the same batch-of-metrics simulation many times and tally, per
// correction rule, the family-wise error rate (did ANY true-null metric get falsely flagged), the
// power (what fraction of the genuinely-lifted metrics got correctly flagged), and the false
// discovery rate (of the metrics flagged, what fraction were actually false), the same seed-per-
// trial tallying pattern used throughout this series' other repeated-trials engines.
import { simulateMetricBatch, type MultiMetricBatchConfig } from "./multi-metric-experiment";
import { benjaminiHochberg, bonferroniRejections, naiveRejections } from "./multiple-testing";

export interface MultiMetricStudyConfig extends MultiMetricBatchConfig {
	trials: number;
	alpha: number;
}

export interface MultiMetricStudyResult {
	naive_fwer: number;
	bonferroni_fwer: number;
	bh_fwer: number;
	naive_power: number;
	bonferroni_power: number;
	bh_power: number;
	naive_fdr: number;
	bonferroni_fdr: number;
	bh_fdr: number;
}

export function runMultiMetricStudy(config: MultiMetricStudyConfig): MultiMetricStudyResult {
	let naiveFwerCount = 0;
	let bonferroniFwerCount = 0;
	let bhFwerCount = 0;
	let naiveTruePositives = 0;
	let bonferroniTruePositives = 0;
	let bhTruePositives = 0;
	let naiveFdrSum = 0;
	let bonferroniFdrSum = 0;
	let bhFdrSum = 0;
	let totalTruePositives = 0;

	for (let trial = 0; trial < config.trials; trial++) {
		const outcomes = simulateMetricBatch({ ...config, seed: config.seed + trial });
		const pValues = outcomes.map((o) => o.p_value);
		const isNull = outcomes.map((o) => o.is_null);
		totalTruePositives += isNull.filter((n) => !n).length;

		const naive = naiveRejections(pValues, config.alpha);
		const bonferroni = bonferroniRejections(pValues, config.alpha);
		const bh = benjaminiHochberg(pValues, config.alpha);

		if (naive.some((r, i) => r && isNull[i])) naiveFwerCount++;
		if (bonferroni.some((r, i) => r && isNull[i])) bonferroniFwerCount++;
		if (bh.some((r, i) => r && isNull[i])) bhFwerCount++;

		naiveTruePositives += naive.filter((r, i) => r && !isNull[i]).length;
		bonferroniTruePositives += bonferroni.filter((r, i) => r && !isNull[i]).length;
		bhTruePositives += bh.filter((r, i) => r && !isNull[i]).length;

		const accumulateFdr = (rejections: boolean[]) => {
			const totalRejections = rejections.filter(Boolean).length;
			if (totalRejections === 0) return 0;
			const falseRejections = rejections.filter((r, i) => r && isNull[i]).length;
			return falseRejections / totalRejections;
		};
		naiveFdrSum += accumulateFdr(naive);
		bonferroniFdrSum += accumulateFdr(bonferroni);
		bhFdrSum += accumulateFdr(bh);
	}

	const power = (truePositives: number) => (totalTruePositives > 0 ? truePositives / totalTruePositives : 0);

	return {
		naive_fwer: naiveFwerCount / config.trials,
		bonferroni_fwer: bonferroniFwerCount / config.trials,
		bh_fwer: bhFwerCount / config.trials,
		naive_power: power(naiveTruePositives),
		bonferroni_power: power(bonferroniTruePositives),
		bh_power: power(bhTruePositives),
		naive_fdr: naiveFdrSum / config.trials,
		bonferroni_fdr: bonferroniFdrSum / config.trials,
		bh_fdr: bhFdrSum / config.trials,
	};
}
