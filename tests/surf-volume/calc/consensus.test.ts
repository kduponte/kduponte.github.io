import { describe, expect, it } from "vitest";
import { agreementLabel, computeConsensus, median, medianAbsoluteDeviation, quantile } from "../../../src/lib/surf-volume/consensus";

describe("quantile / median", () => {
	it("computes median for odd and even length arrays", () => {
		expect(median([1, 2, 3])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	it("quantile(0) and quantile(1) are min and max", () => {
		const xs = [5, 1, 9, 3];
		expect(quantile(xs, 0)).toBe(1);
		expect(quantile(xs, 1)).toBe(9);
	});

	it("medianAbsoluteDeviation is 0 for identical values", () => {
		expect(medianAbsoluteDeviation([5, 5, 5])).toBe(0);
	});
});

describe("computeConsensus", () => {
	it("returns insufficient_data with n=0 for empty input, never a fabricated 0", () => {
		const result = computeConsensus([]);
		expect(result.median).toBeNull();
		expect(result.n_contributing_systems).toBe(0);
		expect(result.agreement_label).toBe("insufficient_data");
	});

	it("computes median/min/max/iqr correctly on a known set", () => {
		const result = computeConsensus([46, 50, 54, 58, 64]);
		expect(result.median).toBe(54);
		expect(result.min).toBe(46);
		expect(result.max).toBe(64);
		expect(result.n_contributing_systems).toBe(5);
	});

	it("agreement label follows configured relative-IQR thresholds", () => {
		expect(agreementLabel(0.05)).toBe("high");
		expect(agreementLabel(0.1)).toBe("moderate");
		expect(agreementLabel(0.2)).toBe("low");
		expect(agreementLabel(null)).toBe("insufficient_data");
	});

	it("tight cluster of values yields high agreement", () => {
		const result = computeConsensus([50, 50.5, 51, 50.2, 49.8]);
		expect(result.agreement_label).toBe("high");
	});

	it("widely spread values yield low agreement", () => {
		const result = computeConsensus([30, 50, 70, 90, 110]);
		expect(result.agreement_label).toBe("low");
	});
});
