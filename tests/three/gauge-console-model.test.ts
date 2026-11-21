import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import {
	DIAL_HALF_SWEEP,
	DIAL_Z_MAX,
	buildGaugeConsole,
	consoleFraming,
	dialAngle,
	pixelNumber,
	redZoneArcs,
	type GaugeConsole,
} from "../../src/lib/three/gauge-console-model";
import { DEFAULT_CONSOLE_COLORS } from "../../src/lib/three/gauge-dial";
import { shade } from "../../src/lib/three/kit";
import { DEFAULT_TRUCK_COLORS } from "../../src/lib/three/toyota-truck-model";
import { HERO_SEEDS, runGaugeDashboard } from "../../src/lib/stats-sim/dashboard-runs";

function bounds(model: GaugeConsole): Box3 {
	model.group.updateMatrixWorld(true);
	const box = new Box3();
	for (const part of model.parts) box.expandByObject(part);
	return box;
}

describe("dialAngle", () => {
	it("is zero straight up, clockwise for positive z, 24 degrees per unit", () => {
		expect(dialAngle(0)).toBe(0);
		expect(dialAngle(1)).toBeCloseTo((24 * Math.PI) / 180, 12);
		expect(dialAngle(-2.5)).toBeCloseTo((-60 * Math.PI) / 180, 12);
	});

	it("pins at the ends of the dial", () => {
		expect(dialAngle(9)).toBe(DIAL_HALF_SWEEP);
		expect(dialAngle(-9)).toBe(-DIAL_HALF_SWEEP);
	});
});

describe("redZoneArcs", () => {
	it("runs from the redline to each end of the dial", () => {
		const [right, left] = redZoneArcs(1.96);
		const inner = dialAngle(1.96);
		// RingGeometry angles are counterclockwise from +X, so up is pi/2.
		expect(right.start).toBeCloseTo(Math.PI / 2 - DIAL_HALF_SWEEP, 12);
		expect(right.start + right.length).toBeCloseTo(Math.PI / 2 - inner, 12);
		expect(left.start).toBeCloseTo(Math.PI / 2 + inner, 12);
		expect(left.start + left.length).toBeCloseTo(Math.PI / 2 + DIAL_HALF_SWEEP, 12);
	});

	it("shrinks as the redline moves outward", () => {
		expect(redZoneArcs(3.02)[0].length).toBeLessThan(redZoneArcs(1.96)[0].length);
	});

	it("is empty past the end of the dial", () => {
		expect(redZoneArcs(DIAL_Z_MAX)).toEqual([]);
		expect(redZoneArcs(7)).toEqual([]);
	});

	it("puts every flagged needle inside a red arc and every other needle outside, for every seed and rule", () => {
		const inArc = (angleCw: number, arcs: { start: number; length: number }[]) => {
			const ccw = Math.PI / 2 - angleCw;
			return arcs.some((a) => ccw >= a.start - 1e-12 && ccw <= a.start + a.length + 1e-12);
		};
		for (const seed of HERO_SEEDS) {
			const run = runGaugeDashboard(seed);
			for (const rule of ["none", "bonferroni", "bh"] as const) {
				const arcs = redZoneArcs(run.redline[rule].z);
				for (const m of run.metrics) {
					// On a boundary (never happens in these seeds) the arc test would be ambiguous.
					expect(Math.abs(Math.abs(m.z) - run.redline[rule].z)).toBeGreaterThan(1e-6);
					expect(inArc(dialAngle(m.z), arcs)).toBe(m.flagged[rule]);
				}
			}
		}
	});
});

describe("pixelNumber", () => {
	it("draws one square per lit pixel", () => {
		// "1" lights 8 pixels and "9" lights 12, two triangles each.
		expect(pixelNumber("1").getAttribute("position").count).toBe(8 * 4);
		expect(pixelNumber("19").getAttribute("position").count).toBe(20 * 4);
	});

	it("rejects characters it has no glyph for", () => {
		expect(() => pixelNumber("#")).toThrow();
	});
});

describe("buildGaugeConsole", () => {
	const model = buildGaugeConsole();

	it("wears the 22RE truck's dash gray", () => {
		expect(DEFAULT_CONSOLE_COLORS.dash).toBe(shade(DEFAULT_TRUCK_COLORS.interior, 0.35));
	});

	it("has one numbered gauge per metric, in reading order", () => {
		expect(model.gauges).toHaveLength(20);
		expect(model.gauges.map((g) => g.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
		const [first, second, , , , sixth] = model.gauges;
		expect(second.center[0]).toBeGreaterThan(first.center[0]);
		expect(sixth.center[1]).toBeLessThan(first.center[1]);
	});

	it("is wider than it is tall and much shallower than either", () => {
		const size = bounds(model).getSize(new Vector3());
		expect(size.x / size.y).toBeGreaterThan(1.1);
		expect(size.x / size.y).toBeLessThan(1.6);
		expect(size.z).toBeLessThan(size.y / 2);
	});

	it("fits inside its own framing", () => {
		const { target, turnRadius, halfHeight } = consoleFraming();
		const box = bounds(model);
		for (const x of [box.min.x, box.max.x]) {
			for (const z of [box.min.z, box.max.z]) expect(Math.hypot(x, z)).toBeLessThanOrEqual(turnRadius + 1e-6);
		}
		expect(box.max.y - target[1]).toBeLessThanOrEqual(halfHeight);
		expect(target[1] - box.min.y).toBeLessThanOrEqual(halfHeight);
	});

	it("turns each needle to its z", () => {
		model.setNeedle(3, 2.5);
		expect(model.gauges[3].needle.rotation.z).toBeCloseTo(-dialAngle(2.5), 12);
		model.setNeedle(3, -7);
		expect(model.gauges[3].needle.rotation.z).toBeCloseTo(DIAL_HALF_SWEEP, 12);
	});

	it("starts with no red zone and shares one red-zone geometry across every dial", () => {
		const fresh = buildGaugeConsole();
		expect(fresh.gauges[0].redZone.geometry.getAttribute("position")).toBeUndefined();
		fresh.setRedline(1.96);
		expect(fresh.redline).toBeCloseTo(1.96, 12);
		const geo = fresh.gauges[0].redZone.geometry;
		expect(geo.getAttribute("position").count).toBeGreaterThan(0);
		for (const g of fresh.gauges) expect(g.redZone.geometry).toBe(geo);
		fresh.setRedline(-3.02);
		expect(fresh.redline).toBeCloseTo(3.02, 12);
		expect(fresh.gauges[7].redZone.geometry).not.toBe(geo);
		fresh.dispose();
	});

	it("lights lamps in the ground truth's color and turns them off", () => {
		model.setLamp(0, "null");
		const lit = model.gauges[0].lampMaterial;
		expect(lit.emissiveIntensity).toBeGreaterThan(0);
		expect(`#${lit.emissive.getHexString()}`).toBe("#ff5a1f");
		model.setLamp(1, "lift", 0.5);
		expect(`#${model.gauges[1].lampMaterial.emissive.getHexString()}`).toBe("#c8ff3d");
		expect(model.gauges[1].lampMaterial.emissiveIntensity).toBeLessThan(lit.emissiveIntensity);
		model.setLamp(0, "off");
		expect(lit.emissiveIntensity).toBe(0);
	});

	it("builds a plausible number of parts", () => {
		expect(model.parts.length).toBeGreaterThan(150);
		expect(model.parts.length).toBeLessThan(400);
	});

	it("rejects more gauges than the panel holds", () => {
		expect(() => buildGaugeConsole(21)).toThrow();
	});

	it("disposes without throwing", () => {
		expect(() => model.dispose()).not.toThrow();
	});
});
