import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { FIN_BOX, TC_LONGBOARD, buildLongboard, foilAt, halfWidthAt } from "../../src/lib/three/longboard-model";

const INCH = 0.0254;
const L = TC_LONGBOARD.lengthM;
const widthAt = (inchesFromTail: number) => (2 * halfWidthAt((inchesFromTail * INCH) / L)) / INCH;

describe("longboard outline", () => {
	it("is 23.5 in at its wide point, just forward of center", () => {
		expect(widthAt(0.52 * 114)).toBeCloseTo(23.5, 6);
		for (const f of [0.3, 0.45, 0.6, 0.75]) expect(halfWidthAt(f)).toBeLessThanOrEqual(halfWidthAt(0.52) + 1e-9);
	});

	it("narrows to a classic tail: about 14.5 in a foot up, rounded to well under that at the end", () => {
		expect(widthAt(12)).toBeGreaterThan(13.5);
		expect(widthAt(12)).toBeLessThan(15.5);
		expect(widthAt(0)).toBeLessThan(widthAt(3));
		expect(widthAt(0)).toBeLessThan(9);
	});

	it("carries a wider nose than tail, about 17.5 in a foot back, rounding to a point", () => {
		expect(widthAt(114 - 12)).toBeGreaterThan(16.5);
		expect(widthAt(114 - 12)).toBeLessThan(18.5);
		expect(widthAt(114 - 12)).toBeGreaterThan(widthAt(12));
		expect(halfWidthAt(1)).toBe(0);
	});
});

describe("longboard foil", () => {
	it("is full thickness in the middle and about half at the tail", () => {
		expect(foilAt(0.5)).toBe(1);
		expect(foilAt(0)).toBeCloseTo(0.5, 6);
		expect(foilAt(1)).toBeCloseTo(0.55, 6);
		expect(foilAt(0.1)).toBeLessThan(foilAt(0.3));
	});
});

describe("buildLongboard", () => {
	it("is 9'6\" long, thins toward the tail, and disposes cleanly", () => {
		const board = buildLongboard();
		board.group.updateMatrixWorld(true);
		const size = new Box3().setFromObject(board.group).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(L - 0.02);
		expect(size.x).toBeLessThan(L + 0.05);
		expect(FIN_BOX.lengthM / INCH).toBe(10);
		expect(() => board.dispose()).not.toThrow();
	});
});
