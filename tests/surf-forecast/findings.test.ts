import { describe, expect, it } from "vitest";
import { ft, listJoin, need, pct, pick, signed, signedFt } from "../../src/lib/surf-forecast/findings";

const rows = [
	{ scope: "all", source: "ecmwf_wam", variable: "wave_height", lead_days: 3, mae: 0.24 },
	{ scope: "hawaii", source: "ecmwf_wam", variable: "wave_height", lead_days: 3, mae: 0.25 },
];

describe("pick", () => {
	it("finds the exact row", () => {
		expect(pick(rows, "hawaii", "ecmwf_wam", "wave_height", 3).mae).toBe(0.25);
	});

	it("throws rather than letting prose quote a number that does not exist", () => {
		expect(() => pick(rows, "norcal", "ecmwf_wam", "wave_height", 3)).toThrow(/norcal/);
	});
});

describe("need", () => {
	it("passes real values through and throws on null", () => {
		expect(need(0, "zero")).toBe(0);
		expect(() => need(null, "bias")).toThrow(/bias/);
	});
});

describe("formatting", () => {
	it("converts metres to feet", () => {
		expect(ft(0.3048)).toBe("1.00");
		expect(ft(1, 1)).toBe("3.3");
	});

	it("signs values with a true minus sign", () => {
		expect(signedFt(0.3048)).toBe("+1.00");
		expect(signedFt(-0.3048)).toBe("−1.00");
		expect(signed(0)).toBe("0.00");
	});

	it("rounds percentages", () => {
		expect(pct(0.716)).toBe("72%");
	});

	it("joins lists the way prose does", () => {
		expect(listJoin([])).toBe("");
		expect(listJoin(["Hawaii"])).toBe("Hawaii");
		expect(listJoin(["Hawaii", "Northern California"])).toBe("Hawaii and Northern California");
		expect(listJoin(["a", "b", "c"])).toBe("a, b and c");
	});
});
