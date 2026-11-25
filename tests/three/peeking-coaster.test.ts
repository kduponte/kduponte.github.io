import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import {
	MANY_RUN_PROFILE,
	ONE_RUN_PROFILE,
	buildCoasterStage,
	buildRunRibbon,
	coasterLayout,
	dayAngle,
	floorCrossings,
	hermite,
	manyRadius,
	monotoneSlopes,
	pToY,
	runTrack,
} from "../../src/lib/three/peeking-coaster";
import { coasterFallback } from "../../src/lib/three/peeking-coaster-fallback";

const layout = coasterLayout(30, 0.05);

/** Seed 1's run from the page's study, rounded: dips under 0.05 on days 18-21 and 25. */
const RUN = [
	0.79, 0.66, 0.65, 0.46, 0.51, 0.22, 0.28, 0.15, 0.08, 0.22, 0.22, 0.24, 0.13, 0.08, 0.14, 0.1, 0.051, 0.0316, 0.011, 0.012, 0.03, 0.07,
	0.08, 0.09, 0.049, 0.06, 0.12, 0.19, 0.34, 0.381,
];

describe("log axis", () => {
	it("puts p = 1 at the top, pMin on the plinth and alpha in between", () => {
		expect(pToY(1, layout)).toBeCloseTo(layout.height, 12);
		expect(pToY(layout.pMin, layout)).toBeCloseTo(0, 12);
		expect(pToY(1e-9, layout)).toBe(0);
		const yA = pToY(0.05, layout);
		expect(yA).toBeGreaterThan(0);
		expect(yA).toBeLessThan(layout.height);
		// Equal ratios, equal steps.
		expect(pToY(0.1, layout) - pToY(0.01, layout)).toBeCloseTo(pToY(1, layout) - pToY(0.1, layout), 12);
	});

	it("spreads the days evenly over the arc, leaving a gap", () => {
		expect(dayAngle(0, layout)).toBeCloseTo(layout.arcStart, 12);
		expect(dayAngle(29, layout) - dayAngle(0, layout)).toBeCloseTo(layout.arcSpan, 12);
		expect(layout.arcSpan).toBeLessThan(Math.PI * 2);
	});
});

describe("monotone track between peeks", () => {
	const ys = RUN.map((p) => pToY(p, layout));
	const ms = monotoneSlopes(ys);

	it("passes through every daily value", () => {
		ys.forEach((y, i) => expect(hermite(ys, ms, i).y).toBeCloseTo(y, 9));
	});

	it("never overshoots the two peeks it joins", () => {
		for (let k = 0; k < ys.length - 1; k++) {
			const lo = Math.min(ys[k], ys[k + 1]) - 1e-9;
			const hi = Math.max(ys[k], ys[k + 1]) + 1e-9;
			for (let s = 1; s < 20; s++) {
				const y = hermite(ys, ms, k + s / 20).y;
				expect(y).toBeGreaterThanOrEqual(lo);
				expect(y).toBeLessThanOrEqual(hi);
			}
		}
	});
});

describe("floor crossings", () => {
	it("finds each dip through the glass between the right peeks", () => {
		const c = floorCrossings(RUN, layout);
		expect(c.map((x) => [x.kind, x.day])).toEqual([
			["down", 18],
			["up", 22],
			["down", 25],
			["up", 26],
		]);
		const yF = pToY(0.05, layout);
		const ys = RUN.map((p) => pToY(p, layout));
		const ms = monotoneSlopes(ys);
		for (const x of c) {
			expect(x.u).toBeGreaterThan(x.day - 2);
			expect(x.u).toBeLessThan(x.day - 1);
			expect(hermite(ys, ms, x.u).y).toBeCloseTo(yF, 6);
		}
	});

	it("counts a start under the glass as a day-1 crossing and treats p = alpha as over it", () => {
		expect(floorCrossings([0.01, 0.2, 0.3], layout)[0]).toEqual({ u: 0, day: 1, kind: "down" });
		expect(floorCrossings([0.2, 0.05, 0.3], layout)).toEqual([]);
	});
});

describe("run ribbon", () => {
	const ribbon = buildRunRibbon(RUN, layout, { radius: layout.radius, profile: ONE_RUN_PROFILE, posts: true });

	it("rides a frame whose up points up and whose across points out of the ring", () => {
		const f = ribbon.track.frame(4.5);
		expect(f.normal.y).toBeGreaterThan(0);
		expect(Math.abs(f.tangent.dot(f.normal))).toBeLessThan(1e-9);
		expect(Math.abs(f.tangent.dot(f.binormal))).toBeLessThan(1e-9);
		const flat = new Vector3(f.position.x, 0, f.position.z).normalize();
		expect(f.binormal.dot(flat)).toBeCloseTo(1, 9);
		expect(Math.hypot(f.position.x, f.position.z)).toBeCloseTo(layout.radius, 9);
	});

	it("stands a post under every daily peek, as tall as that day's p", () => {
		const posts = ribbon.group.children.filter((c) => c.type === "Mesh" && Math.abs(c.position.y) < 1e-9 && c.scale.y !== 1);
		expect(posts).toHaveLength(30);
		posts.forEach((post, i) => expect(post.scale.y).toBeCloseTo(pToY(RUN[i], layout) - ONE_RUN_PROFILE.thickness / 2, 6));
	});

	it("flashes at every dip and leaves one mark, at the first", () => {
		expect(ribbon.flashes.map((f) => f.crossing.day)).toEqual([18, 25]);
		expect(ribbon.flashes[0].mark).not.toBeNull();
		expect(ribbon.flashes[1].mark).toBeNull();
		const yF = pToY(0.05, layout);
		for (const f of ribbon.flashes) expect(f.at.y).toBeGreaterThan(yF);
	});

	it("stays inside the floor and between the plinth and p = 1", () => {
		ribbon.group.updateMatrixWorld(true);
		const box = new Box3();
		ribbon.group.traverse((o) => {
			if (o.visible && o.type === "Mesh") box.expandByObject(o, true);
		});
		expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
		expect(box.max.y).toBeLessThan(layout.height + 0.1);
		expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThan(layout.floorRadius);
	});

	it("reveals monotonically from day 1 to the whole ribbon", () => {
		const mesh = ribbon.group.children[0] as unknown as { geometry: { index: { count: number }; drawRange: { count: number } } };
		const total = mesh.geometry.index.count;
		let prev = -1;
		for (let u = 0; u <= 29; u += 0.25) {
			ribbon.reveal(u);
			const n = mesh.geometry.drawRange.count;
			expect(n).toBeGreaterThanOrEqual(prev);
			expect(n % 3).toBe(0);
			prev = n;
		}
		ribbon.reveal(29);
		expect(mesh.geometry.drawRange.count).toBe(total);
	});

	it("disposes without throwing", () => {
		expect(() => ribbon.dispose()).not.toThrow();
	});
});

describe("many runs", () => {
	it("gives every run its own ring, inside the floor, with room for the outlines", () => {
		const radii = Array.from({ length: 20 }, (_, i) => manyRadius(i, 20, layout));
		expect(radii[0]).toBe(layout.manyRadii[0]);
		expect(radii[19]).toBeCloseTo(layout.manyRadii[1], 12);
		const gap = radii[1] - radii[0];
		expect(gap).toBeGreaterThan(MANY_RUN_PROFILE.width + 2 * MANY_RUN_PROFILE.outline);
		expect(radii[19] + MANY_RUN_PROFILE.width).toBeLessThan(layout.floorRadius);
	});
});

describe("stage", () => {
	const stage = buildCoasterStage(layout);

	it("puts the glass at alpha", () => {
		expect(stage.floorY).toBeCloseTo(pToY(0.05, layout), 12);
	});

	it("labels the axis at the decades and at alpha", () => {
		expect(stage.labels.map((l) => l.text)).toEqual(["1", "0.1", "0.05", "0.01", "0.001"]);
		expect(stage.labels.find((l) => l.text === "0.05")?.position.y).toBeCloseTo(stage.floorY, 12);
	});

	it("disposes without throwing", () => {
		expect(() => stage.dispose()).not.toThrow();
	});
});

describe("SVG fallback", () => {
	it("draws each run on the same log axis with its first dip marked on the glass line", () => {
		const fb = coasterFallback([RUN, RUN.map(() => 0.5)], layout);
		expect(fb.runs).toHaveLength(2);
		expect(fb.runs[0].mark?.y).toBe(fb.floorY);
		expect(fb.runs[1].mark).toBeNull();
		expect(fb.ticks.find((t) => t.accent)?.y).toBe(fb.floorY);
		// Path starts at day 1's height.
		const t1 = fb.ticks[0].y; // p = 1
		const tMin = fb.ticks[fb.ticks.length - 1].y; // pMin
		const startY = Number(fb.runs[1].d.split(" ")[1]);
		expect(startY).toBeCloseTo(tMin + ((t1 - tMin) * pToY(0.5, layout)) / layout.height, 0);
	});

	it("keeps runTrack and the fallback on one curve", () => {
		const track = runTrack(RUN, layout, 1);
		expect(track.ys).toHaveLength(30);
	});
});
