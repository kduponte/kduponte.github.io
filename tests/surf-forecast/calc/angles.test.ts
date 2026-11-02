import { describe, expect, it } from "vitest";
import {
	absAngularDifferenceDeg,
	circularDispersion,
	circularMeanDeg,
	degreesToCompass,
	meanResultantLength,
	normalizeDeg,
	signedAngularDifferenceDeg,
	windRelationToBeach,
} from "../../../src/lib/surf-forecast/angles";

describe("normalizeDeg", () => {
	it("wraps negatives and values past 360 into [0, 360)", () => {
		expect(normalizeDeg(0)).toBe(0);
		expect(normalizeDeg(360)).toBe(0);
		expect(normalizeDeg(-10)).toBe(350);
		expect(normalizeDeg(370)).toBe(10);
		expect(normalizeDeg(-370)).toBe(350);
	});
});

describe("signedAngularDifferenceDeg", () => {
	// The whole reason this module exists: the naive subtraction gives -350 here.
	it("takes the short way around the circle", () => {
		expect(signedAngularDifferenceDeg(5, 355)).toBe(10);
		expect(signedAngularDifferenceDeg(355, 5)).toBe(-10);
	});

	it("keeps the sign, so a consistent veer shows up as bias rather than cancelling", () => {
		expect(signedAngularDifferenceDeg(105, 90)).toBe(15);
		expect(signedAngularDifferenceDeg(75, 90)).toBe(-15);
	});

	it("returns 0 for identical bearings, including across the wrap", () => {
		expect(signedAngularDifferenceDeg(90, 90)).toBe(0);
		expect(signedAngularDifferenceDeg(360, 0)).toBe(0);
	});

	it("puts an exact half-turn at the documented -180 boundary", () => {
		expect(signedAngularDifferenceDeg(180, 0)).toBe(-180);
	});
});

describe("absAngularDifferenceDeg", () => {
	it("never exceeds 180", () => {
		expect(absAngularDifferenceDeg(359, 1)).toBe(2);
		expect(absAngularDifferenceDeg(0, 180)).toBe(180);
		expect(absAngularDifferenceDeg(270, 90)).toBe(180);
	});

	it("is symmetric", () => {
		expect(absAngularDifferenceDeg(300, 20)).toBe(absAngularDifferenceDeg(20, 300));
	});
});

describe("circularMeanDeg", () => {
	// A naive arithmetic mean of these returns 180, pointing due south: the exact opposite.
	it("averages across the 0/360 wrap correctly", () => {
		expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 6);
		expect(circularMeanDeg([340, 20])).toBeCloseTo(0, 6);
	});

	it("matches the arithmetic mean when no wrap is involved", () => {
		expect(circularMeanDeg([80, 100])).toBeCloseTo(90, 6);
		expect(circularMeanDeg([170, 190])).toBeCloseTo(180, 6);
	});

	it("returns null when the bearings cancel out and no mean is meaningful", () => {
		expect(circularMeanDeg([0, 90, 180, 270])).toBeNull();
		expect(circularMeanDeg([0, 180])).toBeNull();
	});

	it("returns null for empty input rather than throwing or returning 0", () => {
		expect(circularMeanDeg([])).toBeNull();
	});

	it("returns the bearing itself for a single sample", () => {
		expect(circularMeanDeg([237])).toBeCloseTo(237, 6);
	});
});

describe("meanResultantLength / circularDispersion", () => {
	it("is fully concentrated when all bearings agree", () => {
		expect(meanResultantLength([90, 90, 90])).toBeCloseTo(1, 6);
		expect(circularDispersion([90, 90, 90])).toBeCloseTo(0, 6);
	});

	it("is fully dispersed when bearings cancel", () => {
		expect(meanResultantLength([0, 180])).toBeCloseTo(0, 6);
		expect(circularDispersion([0, 180])).toBeCloseTo(1, 6);
	});

	it("sits in between for a spread that mostly agrees", () => {
		const r = meanResultantLength([80, 90, 100]);
		expect(r).toBeGreaterThan(0.9);
		expect(r).toBeLessThan(1);
	});
});

describe("degreesToCompass", () => {
	it("labels the cardinals and wraps back to N", () => {
		expect(degreesToCompass(0)).toBe("N");
		expect(degreesToCompass(90)).toBe("E");
		expect(degreesToCompass(180)).toBe("S");
		expect(degreesToCompass(270)).toBe("W");
		expect(degreesToCompass(360)).toBe("N");
		expect(degreesToCompass(359)).toBe("N");
	});

	it("labels an intercardinal", () => {
		expect(degreesToCompass(292.5)).toBe("WNW");
	});
});

describe("windRelationToBeach", () => {
	// Linda Mar faces roughly west (beach normal 270). Wind bearings are "from" directions, so a
	// west wind is blowing onshore and an east wind is offshore. Inverting this would make the toy
	// confidently backwards about the single variable that most decides whether the beach is good.
	const LINDA_MAR_NORMAL = 270;

	it("calls a westerly onshore at a west-facing beach", () => {
		expect(windRelationToBeach(270, LINDA_MAR_NORMAL)).toBe("onshore");
		expect(windRelationToBeach(285, LINDA_MAR_NORMAL)).toBe("onshore");
	});

	it("calls an easterly offshore at a west-facing beach", () => {
		expect(windRelationToBeach(90, LINDA_MAR_NORMAL)).toBe("offshore");
		expect(windRelationToBeach(105, LINDA_MAR_NORMAL)).toBe("offshore");
	});

	it("calls a wind square to the beach cross-shore", () => {
		expect(windRelationToBeach(180, LINDA_MAR_NORMAL)).toBe("cross");
		expect(windRelationToBeach(0, LINDA_MAR_NORMAL)).toBe("cross");
	});

	it("handles a beach facing near due north without wrap errors", () => {
		expect(windRelationToBeach(0, 0)).toBe("onshore");
		expect(windRelationToBeach(350, 0)).toBe("onshore");
		expect(windRelationToBeach(180, 0)).toBe("offshore");
	});
});
