import { describe, expect, it } from "vitest";
import { Group, Mesh } from "three";
import { buildSharkShadow, passOffsetRange, sharkPose, type SharkPlan } from "../../src/lib/three/shark";

const HALF = 3;
const plan: SharkPlan = { interval_s: 45, length: 2.2, speed: 0.56, seed: 51205 };

/** Samples of one pass, k, every dt seconds until it ends. */
function pass(k: number, p = plan, dt = 0.05) {
	const out: { t: number; x: number; z: number; heading: number }[] = [];
	for (let tau = 0; tau < p.interval_s; tau += dt) {
		const pose = sharkPose(p, k * p.interval_s + tau, HALF);
		if (!pose) break;
		out.push({ t: tau, ...pose });
	}
	return out;
}

describe("sharkPose", () => {
	it("crosses the block and is gone before the next pass starts", () => {
		const samples = pass(0);
		expect(samples.length).toBeGreaterThan(10);
		const duration = samples[samples.length - 1].t;
		expect(duration).toBeLessThan(plan.interval_s);
		expect(sharkPose(plan, duration + 0.5, HALF)).toBeNull();
		expect(sharkPose(plan, plan.interval_s + 0.01, HALF)).not.toBeNull();
	});

	it("enters with its nose at a wall and leaves with its tail past one", () => {
		const maxNorm = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));
		for (const k of [0, 1, 2, 3]) {
			const s = pass(k);
			const first = s[0];
			const last = s[s.length - 1];
			const ux = Math.cos(first.heading);
			const uz = Math.sin(first.heading);
			const L = plan.length / 2;
			// At the start the whole body is behind the nose, and the nose is at (or outside) the block's edge.
			expect(maxNorm(first.x + L * ux, first.z + L * uz)).toBeGreaterThanOrEqual(HALF - 1e-6);
			// At the end the tail has (all but a sample step) cleared the block.
			expect(maxNorm(last.x - L * ux, last.z - L * uz)).toBeGreaterThanOrEqual(HALF - plan.speed * 0.05 - 1e-6);
			expect(s.some((p) => maxNorm(p.x, p.z) < HALF)).toBe(true);
		}
	});

	it("swims straight at its cruising speed", () => {
		const s = pass(1);
		const a = s[10];
		const b = s[30];
		expect(Math.hypot(b.x - a.x, b.z - a.z) / (b.t - a.t)).toBeCloseTo(plan.speed, 5);
		expect(new Set(s.map((p) => p.heading.toFixed(9))).size).toBe(1);
	});

	it("always clears the buoy and its mooring at the center", () => {
		const [lo] = passOffsetRange(plan.length, HALF);
		for (let k = 0; k < 40; k++) {
			for (const p of pass(k, plan, 0.5)) expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(lo - 1e-9);
		}
	});

	it("is repeatable, and varies from pass to pass and station to station", () => {
		expect(sharkPose(plan, 12.3, HALF)).toEqual(sharkPose(plan, 12.3, HALF));
		expect(pass(0)[0].heading).not.toBeCloseTo(pass(1)[0].heading, 3);
		expect(sharkPose({ ...plan, seed: 1 }, 5, HALF)).not.toEqual(sharkPose(plan, 5, HALF));
	});

	it("never appears without a valid interval or speed", () => {
		expect(sharkPose({ ...plan, interval_s: 0 }, 5, HALF)).toBeNull();
		expect(sharkPose({ ...plan, speed: 0 }, 5, HALF)).toBeNull();
	});
});

describe("buildSharkShadow", () => {
	it("hides with no plan and shows, posed and sized, during a pass", () => {
		const block = new Group();
		const shark = buildSharkShadow(block, HALF);
		expect(shark.update(null, 5)).toBeNull();
		expect(shark.mesh.visible).toBe(false);
		const pose = shark.update(plan, 5)!;
		expect(shark.mesh.visible).toBe(true);
		expect(shark.mesh.position.x).toBeCloseTo(pose.x);
		expect(shark.mesh.position.z).toBeCloseTo(pose.z);
		expect(shark.mesh.position.y).toBeLessThan(0);
		expect(shark.mesh.scale.x).toBe(plan.length);
		shark.dispose();
	});

	it("is a shark-shaped outline a body length long, nose forward", () => {
		const shark = buildSharkShadow(new Group(), HALF);
		const g = (shark.mesh as Mesh).geometry;
		g.computeBoundingBox();
		const b = g.boundingBox!;
		expect(b.max.x - b.min.x).toBeCloseTo(1, 5);
		// Pectoral fins make it about half as wide as long; flat in Y.
		expect(b.max.z - b.min.z).toBeGreaterThan(0.45);
		expect(b.max.z - b.min.z).toBeLessThan(0.6);
		expect(b.max.y - b.min.y).toBeLessThan(1e-9);
	});
});
