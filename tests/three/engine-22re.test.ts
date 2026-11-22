import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import categories from "../../public/data/toyota-truck/failure_categories.json";
import {
	COMPRESSION_HEIGHT,
	ENGINE,
	ENGINE_SYSTEMS,
	OFF_ENGINE_CATEGORIES,
	crankAngleAt,
	displacementCc,
	failureTint,
	firingGlow,
	pistonCrownY,
	systemCounts,
} from "../../src/lib/three/engine-22re-data";
import { CYLINDER_X, build22REEngine } from "../../src/lib/three/engine-22re-model";

describe("22R-E geometry", () => {
	it("gets Toyota's 2,366 cc from 92 x 89 mm and four cylinders", () => {
		expect(displacementCc()).toBeGreaterThan(2366);
		expect(displacementCc()).toBeLessThan(2367);
	});

	it("leaves a plausible pin-to-crown height from the deck height, rod and stroke", () => {
		expect(COMPRESSION_HEIGHT * 1000).toBeGreaterThan(30);
		expect(COMPRESSION_HEIGHT * 1000).toBeLessThan(40);
	});

	it("puts cylinder 1's crown flush with the deck at TDC and one stroke lower at BDC", () => {
		expect(pistonCrownY(0, 1)).toBeCloseTo(ENGINE.crankToDeck, 9);
		expect(pistonCrownY(Math.PI, 1)).toBeCloseTo(ENGINE.crankToDeck - ENGINE.stroke, 9);
	});

	it("pairs cylinders 1 with 4 and 2 with 3, half a turn apart", () => {
		for (const theta of [0, 0.7, 2.1, 4]) {
			expect(pistonCrownY(theta, 4)).toBeCloseTo(pistonCrownY(theta, 1), 12);
			expect(pistonCrownY(theta, 3)).toBeCloseTo(pistonCrownY(theta, 2), 12);
			expect(pistonCrownY(theta, 2)).toBeCloseTo(pistonCrownY(theta + Math.PI, 1), 12);
		}
	});

	it("fires in the factory order, 1-3-4-2, once per cylinder every two turns", () => {
		const order: number[] = [];
		const steps = 720;
		for (let i = 0; i < steps; i++) {
			const theta = (i / steps) * 4 * Math.PI;
			for (const cyl of [1, 2, 3, 4]) if (firingGlow(theta, cyl) === 1) order.push(cyl);
		}
		expect(order).toEqual([1, 3, 4, 2]);
	});

	it("runs the crank at the 750 rpm idle slowed 25x: half a turn per second", () => {
		expect(crankAngleAt(1)).toBeCloseTo(Math.PI, 9);
	});
});

describe("failure data mapping", () => {
	const counts = systemCounts(categories);

	it("finds every engine system in the frozen category counts", () => {
		expect(counts.map((c) => c.key)).toEqual(ENGINE_SYSTEMS.map((s) => s.key));
		expect(counts.find((c) => c.key === "drivetrain")?.count).toBe(35);
		expect(counts.find((c) => c.key === "oil")?.count).toBe(2);
	});

	it("accounts for every thread between the engine systems and the off-engine categories", () => {
		const total = categories.reduce((sum, c) => sum + c.count, 0);
		const off = OFF_ENGINE_CATEGORIES.map((cat) => categories.find((c) => c.category === cat)?.count ?? NaN);
		expect(counts.reduce((sum, c) => sum + c.count, 0) + off.reduce((a, b) => a + b, 0)).toBe(total);
	});

	it("throws when a category is missing rather than drawing a guess", () => {
		expect(() => systemCounts(categories.filter((c) => c.category !== "Timing chain"))).toThrow(/Timing chain/);
	});

	it("tints darker as the count rises", () => {
		const lum = (hex: string) => {
			const n = parseInt(hex.slice(1), 16);
			return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
		};
		const ramp = [0, 5, 12, 24, 35].map((c) => lum(failureTint(c, 35)));
		for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeLessThan(ramp[i - 1]);
		expect(failureTint(99, 35)).toBe(failureTint(35, 35));
	});
});

describe("build22REEngine", () => {
	const engine = build22REEngine({ tints: { drivetrain: "#b3161f" } });

	it("gives every system at least one pickable part", () => {
		for (const { key } of ENGINE_SYSTEMS) {
			expect(engine.systems[key].length).toBeGreaterThan(0);
			for (const mesh of engine.systems[key]) expect(mesh.userData.system).toBe(key);
		}
	});

	it("colors a system with its tint and leaves the rest in real finishes", () => {
		expect(`#${engine.systemMaterials.drivetrain.color.getHexString()}`).toBe("#b3161f");
		expect(engine.systemMaterials.fuel.metalness).toBeGreaterThan(0.3);
	});

	it("is about the size of a real 22R-E with its bellhousing", () => {
		engine.group.updateMatrixWorld(true);
		const box = new Box3();
		for (const p of engine.parts) box.expandByObject(p);
		const size = box.getSize(new Vector3());
		expect(size.x).toBeGreaterThan(0.7);
		expect(size.x).toBeLessThan(1.1);
		expect(size.y).toBeGreaterThan(0.5);
		expect(size.y).toBeLessThan(0.8);
	});

	it("spaces the four bores along the crank, cylinder 1 at the front", () => {
		expect(CYLINDER_X).toHaveLength(4);
		expect(CYLINDER_X[0]).toBeGreaterThan(CYLINDER_X[3]);
		expect(CYLINDER_X[0] - CYLINDER_X[1]).toBeCloseTo(ENGINE.boreSpacingEstimate, 9);
		// Neighboring bores must not overlap.
		expect(ENGINE.boreSpacingEstimate).toBeGreaterThan(ENGINE.bore);
	});

	it("disposes without throwing", () => {
		engine.setCrank(1.234);
		expect(() => engine.dispose()).not.toThrow();
	});
});
