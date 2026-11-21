import { describe, expect, it } from "vitest";
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { buildCupedCube, CUBE_CENTER_Y, CUBE_HALF, DATA_HALF, ROD, SPHERE_R } from "../../src/lib/three/cuped-cube-model";
import { buildCupedCloud } from "../../src/lib/stats-sim/cuped-cloud";
import { HERO_CUBE_SEED, LIVE_EXPERIMENT_DEFAULTS } from "../../src/lib/stats-sim/cuped-defaults";

const cloud = buildCupedCloud({ ...LIVE_EXPERIMENT_DEFAULTS, seed: HERO_CUBE_SEED });

function sphereCenters(model: ReturnType<typeof buildCupedCube>): Vector3[] {
	const m = new Matrix4();
	return Array.from({ length: model.spheres.count }, (_, i) => {
		model.spheres.getMatrixAt(i, m);
		return new Vector3().setFromMatrixPosition(m);
	});
}

const sd = (v: number[]) => {
	const mean = v.reduce((s, x) => s + x, 0) / v.length;
	return Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1));
};

describe("buildCupedCube", () => {
	const model = buildCupedCube(cloud);

	it("draws one sphere, and one outline shell, per visitor", () => {
		expect(model.spheres.count).toBe(1200);
		expect(model.sphereOutlines.count).toBe(1200);
		expect(model.sphereOutlines.instanceMatrix).toBe(model.spheres.instanceMatrix);
	});

	it("colors each sphere by its arm", () => {
		const a = cloud.visitors.findIndex((v) => v.arm === "A");
		const b = cloud.visitors.findIndex((v) => v.arm === "B");
		expect(model.spheres.instanceColor).not.toBeNull();
		const ca = model.spheres.instanceColor!.array.slice(a * 3, a * 3 + 3);
		const cb = model.spheres.instanceColor!.array.slice(b * 3, b * 3 + 3);
		expect(Array.from(ca)).not.toEqual(Array.from(cb));
	});

	it("keeps every sphere inside the glass, raw and adjusted", () => {
		const inner = CUBE_HALF - ROD / 2 - SPHERE_R;
		for (const t of [0, 0.5, 1]) {
			model.setCollapse(t);
			for (const p of sphereCenters(model)) {
				expect(Math.abs(p.x)).toBeLessThanOrEqual(inner);
				expect(Math.abs(p.z)).toBeLessThanOrEqual(inner);
				expect(Math.abs(p.y - CUBE_CENTER_Y)).toBeLessThanOrEqual(inner);
			}
		}
	});

	it("shrinks the cloud's vertical spread by exactly sqrt(1 - r^2)", () => {
		model.setCollapse(0);
		const raw = sd(sphereCenters(model).map((p) => p.y));
		const rawBracket = model.bracket().halfLength;
		model.setCollapse(1);
		const adjusted = sd(sphereCenters(model).map((p) => p.y));
		const factor = Math.sqrt(1 - cloud.correlation ** 2);
		expect(adjusted / raw).toBeCloseTo(factor, 5);
		expect(model.bracket().halfLength / rawBracket).toBeCloseTo(factor, 12);
	});

	it("sizes the bracket to one standard deviation of the drawn post-period values", () => {
		model.setCollapse(0);
		const ys = sphereCenters(model).map((p) => p.y);
		expect(model.bracket().halfLength).toBeCloseTo(sd(ys), 5);
		expect(model.bracket().centerY).toBeCloseTo(ys.reduce((s, y) => s + y, 0) / ys.length, 5);
	});

	it("leaves the pre-period and day coordinates alone during the adjustment", () => {
		model.setCollapse(0);
		const before = sphereCenters(model);
		model.setCollapse(1);
		const after = sphereCenters(model);
		before.forEach((p, i) => {
			expect(after[i].x).toBe(p.x);
			expect(after[i].z).toBe(p.z);
		});
		expect(Math.max(...after.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(DATA_HALF);
	});

	it("frames everything: the turning radius covers the widest part at any heading", () => {
		model.group.updateMatrixWorld(true);
		const box = new Box3();
		for (const part of model.parts) box.expandByObject(part);
		const corner = Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z));
		expect(model.framing.turnRadius).toBeGreaterThanOrEqual(corner);
		expect(box.min.y).toBeGreaterThanOrEqual(-0.06);
		expect(model.framing.target.y + model.framing.halfHeight).toBeGreaterThanOrEqual(box.max.y);
	});

	it("stays fully on screen at any heading, framed the way the shared viewer frames it", () => {
		// viewer.ts: 28 degree vertical FOV, back off to fit turnRadius and halfHeight, 1.12 margin.
		for (const aspect of [16 / 10, 4 / 3]) {
			const halfV = (14 * Math.PI) / 180;
			const halfH = Math.atan(Math.tan(halfV) * aspect);
			const { target, turnRadius, halfHeight, viewDir } = model.framing;
			const dist = Math.max(turnRadius / Math.sin(halfH), halfHeight / Math.sin(halfV)) * 1.12;
			const camera = new PerspectiveCamera(28, aspect, 0.1, 80);
			camera.position.copy(target).addScaledVector(viewDir.clone().normalize(), dist);
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
								const p = new Vector3(x, y, z).project(camera);
								expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
								expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
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
