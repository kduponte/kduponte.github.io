import { describe, expect, it } from "vitest";
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from "three";
import {
	BALL_R,
	BOWL_H,
	BOWL_R,
	DIAL_SWEEP,
	buildTareScale,
	packBowl,
} from "../../src/lib/three/tare-scale-model";
import { buildScaleReadings } from "../../src/lib/stats-sim/cuped-readings";
import { simulateCupedVisitors } from "../../src/lib/stats-sim/cuped-cloud";
import { HERO_CUBE_SEED, LIVE_EXPERIMENT_DEFAULTS } from "../../src/lib/stats-sim/cuped-defaults";

const config = { ...LIVE_EXPERIMENT_DEFAULTS, seed: HERO_CUBE_SEED };
const readings = buildScaleReadings(config);
const arms = simulateCupedVisitors(config).map((v) => v.arm);

describe("packBowl", () => {
	const pts = packBowl(1200);

	it("rests every ball inside the glass, none overlapping", () => {
		for (const p of pts) {
			const e = (p.x ** 2 + p.z ** 2) / (BOWL_R - BALL_R) ** 2 + (p.y - BOWL_H) ** 2 / (BOWL_H - BALL_R) ** 2;
			expect(e).toBeLessThanOrEqual(1);
			expect(p.y).toBeLessThanOrEqual(BOWL_H);
			expect(p.y).toBeGreaterThanOrEqual(BALL_R);
		}
		let closest = Infinity;
		for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) closest = Math.min(closest, pts[i].distanceTo(pts[j]));
		expect(closest).toBeGreaterThanOrEqual(2 * BALL_R - 1e-9);
	});

	it("fills from the bottom up, so earlier visitors sit lower", () => {
		for (let i = 1; i < pts.length; i++) expect(pts[i].y).toBeGreaterThanOrEqual(pts[i - 1].y);
	});
});

describe("buildTareScale", () => {
	const model = buildTareScale(readings, arms);

	it("holds one ball per visitor and shows the experiment so far", () => {
		expect(model.balls.count).toBe(1200);
		model.setVisitors(readings.days[4].visitors);
		expect(model.balls.count).toBe(300);
		expect(model.ballOutlines.count).toBe(300);
		model.setVisitors(1200);
	});

	it("colors each ball by its visitor's arm", () => {
		const c = model.balls.instanceColor!.array;
		const a = arms.indexOf("A");
		const b = arms.indexOf("B");
		expect(Array.from(c.slice(a * 3, a * 3 + 3))).not.toEqual(Array.from(c.slice(b * 3, b * 3 + 3)));
	});

	it("puts zero at twelve o'clock and the readings' range at the ends of the sweep", () => {
		expect(model.angleOf(0)).toBe(0);
		expect(model.angleOf(readings.dialMax)).toBeCloseTo(DIAL_SWEEP / 2, 12);
		expect(model.angleOf(-readings.dialMax)).toBeCloseTo(-DIAL_SWEEP / 2, 12);
		expect(model.angleOf(4) - model.angleOf(2)).toBeCloseTo(model.angleOf(2) - model.angleOf(0), 12);
	});

	it("points the needle at the lift and spans the band over the interval", () => {
		const d = readings.days.at(-1)!;
		model.setReading(d.cuped.lift, d.cuped.low, d.cuped.high, 1);
		const s = model.state();
		expect(s.needle).toBeCloseTo(model.angleOf(d.cuped.lift), 12);
		expect(s.band[0]).toBeCloseTo(model.angleOf(d.cuped.low), 12);
		expect(s.band[1]).toBeCloseTo(model.angleOf(d.cuped.high), 12);
		// Narrower after tare, by exactly the ratio of the interval widths.
		model.setReading(d.raw.lift, d.raw.low, d.raw.high, 0);
		const raw = model.state().band;
		expect((s.band[1] - s.band[0]) / (raw[1] - raw[0])).toBeCloseTo((d.cuped.high - d.cuped.low) / (d.raw.high - d.raw.low), 12);
	});

	it("keeps every ball inside the bowl's glass on the pan", () => {
		const m = new Matrix4();
		const p = new Vector3();
		const glass = new Box3();
		model.group.updateMatrixWorld(true);
		for (let i = 0; i < model.balls.count; i++) {
			model.balls.getMatrixAt(i, m);
			p.setFromMatrixPosition(m);
			expect(Math.hypot(p.x, p.z)).toBeLessThan(BOWL_R);
			glass.expandByPoint(p);
		}
		expect(glass.min.y).toBeGreaterThan(1.6);
	});

	it("stays fully on screen at any heading, framed the way the shared viewer frames it", () => {
		for (const aspect of [16 / 10, 4 / 3]) {
			const halfV = (14 * Math.PI) / 180;
			const halfH = Math.atan(Math.tan(halfV) * aspect);
			const { target, turnRadius, halfHeight, viewDir } = model.framing;
			const dist = Math.max(turnRadius / Math.sin(halfH), halfHeight / Math.sin(halfV)) * 1.12;
			const camera = new PerspectiveCamera(28, aspect, 0.1, 80);
			camera.position.copy(target).addScaledVector(viewDir, dist);
			camera.lookAt(target);
			camera.updateMatrixWorld(true);
			for (let k = 0; k < 16; k++) {
				model.group.rotation.y = (k / 16) * Math.PI * 2;
				model.group.updateMatrixWorld(true);
				for (const part of model.parts) {
					const box = new Box3().setFromObject(part);
					for (const x of [box.min.x, box.max.x])
						for (const y of [box.min.y, box.max.y])
							for (const z of [box.min.z, box.max.z]) {
								const q = new Vector3(x, y, z).project(camera);
								expect(Math.abs(q.x)).toBeLessThanOrEqual(1);
								expect(Math.abs(q.y)).toBeLessThanOrEqual(1);
							}
				}
			}
		}
		model.group.rotation.y = 0;
	});

	it("disposes without throwing", () => {
		expect(() => model.dispose()).not.toThrow();
	});
});
