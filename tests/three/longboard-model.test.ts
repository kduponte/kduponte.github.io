import { describe, expect, it } from "vitest";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { FIN_BOX, TC_LONGBOARD, buildLongboard, foilAt, halfWidthAt, surfaceY } from "../../src/lib/three/longboard-model";

const INCH = 0.0254;
const L = TC_LONGBOARD.lengthM;
const widthAt = (inchesFromTail: number) => (2 * halfWidthAt((inchesFromTail * INCH) / L)) / INCH;

describe("longboard outline", () => {
	it("is 23.5 in at its wide point, just forward of center", () => {
		expect(widthAt(0.52 * 112)).toBeCloseTo(23.5, 6);
		for (const f of [0.3, 0.45, 0.6, 0.75]) expect(halfWidthAt(f)).toBeLessThanOrEqual(halfWidthAt(0.52) + 1e-9);
	});

	it("narrows to a classic tail: about 14.5 in a foot up, rounded to well under that at the end", () => {
		expect(widthAt(12)).toBeGreaterThan(13.5);
		expect(widthAt(12)).toBeLessThan(15.5);
		expect(widthAt(0)).toBeLessThan(widthAt(3));
		expect(widthAt(0)).toBeLessThan(9);
	});

	it("carries a wider nose than tail, about 17.5 in a foot back, rounding to a point", () => {
		expect(widthAt(112 - 12)).toBeGreaterThan(16.5);
		expect(widthAt(112 - 12)).toBeLessThan(18.5);
		expect(widthAt(112 - 12)).toBeGreaterThan(widthAt(12));
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
	it("is 9'4\" long, thins toward the tail, and disposes cleanly", () => {
		const board = buildLongboard();
		board.group.updateMatrixWorld(true);
		const size = new Box3().setFromObject(board.group).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(L - 0.02);
		expect(size.x).toBeLessThan(L + 0.05);
		expect(FIN_BOX.lengthM / INCH).toBe(10);
		expect(() => board.dispose()).not.toThrow();
	});

	it("is 3 in thick at the stringer, and the stringer lies just on each face from tail to nose", () => {
		const board = buildLongboard();
		const meshes: Mesh[] = [];
		board.group.traverse((o) => (o as Mesh).isMesh && meshes.push(o as Mesh));
		const isWood = (m: Mesh) => (m.material as MeshStandardMaterial).color?.getHexString() === "8b5a2b";
		const stringers = meshes.filter(isWood);
		expect(stringers).toHaveLength(2);
		let checked = 0;
		for (const s of stringers) {
			const pos = s.geometry.getAttribute("position");
			// Which face this one is laid on: the bottom (+1) or the deck (-1).
			const [x0, y0, z0] = [pos.getX(0), pos.getY(0), pos.getZ(0)];
			const side = Math.abs(y0 - surfaceY(1, x0, z0)) < Math.abs(y0 - surfaceY(-1, x0, z0)) ? 1 : -1;
			const xs: number[] = [];
			for (let i = 0; i < pos.count; i++) {
				const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
				// Never more than a couple of millimeters off its face, anywhere along it, and always outside it.
				expect(Math.abs(y - surfaceY(side, x, z))).toBeLessThan(0.002);
				expect(side * (y - surfaceY(side, x, z))).toBeGreaterThan(0);
				xs.push(x);
				checked++;
			}
			expect(Math.min(...xs)).toBeLessThan(-L / 2 + 0.01);
			expect(Math.max(...xs)).toBeGreaterThan(L / 2 - 0.01);
		}
		expect(checked).toBeGreaterThan(600);
		expect((surfaceY(1, 0, 0) - surfaceY(-1, 0, 0)) / INCH).toBeCloseTo(3, 6);
		board.dispose();
	});
});
