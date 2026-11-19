import { describe, expect, it } from "vitest";
import { Box3, Mesh, Vector3, type BufferGeometry } from "three";
import { WINDOW_M, deepWaterSpeedMs, deepWaterWavelengthM } from "../../src/lib/surf-forecast/swell-viz";
import {
	BLOCK_DEPTH,
	FORECAST_TRACE_WIDTH,
	SCALE_STEP_M,
	TILE,
	UNITS_PER_M,
	VERTICAL_EXAGGERATION,
	bearingToSceneVector,
	buildOceanBlock,
	crestSpeedMs,
	forecastTraces,
	surfaceHeight,
	surfaceSlope,
	swellField,
	type SwellField,
} from "../../src/lib/three/ocean";

const reading = (h: number, T: number, dir: number) => ({ wave_height_m: h, dominant_period_s: T, direction_deg: dir });

/** Positions (along the travel direction, scene units) of every crest in [0, span], found by sampling. */
function crestsAlongTravel(f: SwellField, t: number, span: number, step = 1e-4): number[] {
	const h = (s: number) => surfaceHeight(f, f.dir.x * s, f.dir.z * s, t);
	const out: number[] = [];
	for (let s = step; s < span - step; s += step) {
		if (h(s) > h(s - step) && h(s) >= h(s + step)) out.push(s);
	}
	return out;
}

describe("swellField", () => {
	it("draws a 400 m patch on a TILE-unit block", () => {
		expect(UNITS_PER_M * WINDOW_M).toBeCloseTo(TILE);
	});

	it.each([7.14, 10.53, 13.33])("spaces crests at the true deep-water wavelength for a %s s period", (T) => {
		const f = swellField(reading(1.5, T, 300));
		const crests = crestsAlongTravel(f, 0, TILE * 2);
		expect(crests.length).toBeGreaterThanOrEqual(2);
		const spacing = (crests[crests.length - 1] - crests[0]) / (crests.length - 1);
		expect(spacing).toBeCloseTo(deepWaterWavelengthM(T) * UNITS_PER_M, 3);
		expect(f.wavelength_m).toBeCloseTo(deepWaterWavelengthM(T));
	});

	it("fits five crests of a 7 s trade swell and under two of a 13 s south swell on the patch", () => {
		expect(WINDOW_M / swellField(reading(1, 7.14, 37)).wavelength_m).toBeCloseTo(5.03, 1);
		expect(WINDOW_M / swellField(reading(1, 13.33, 163)).wavelength_m).toBeLessThan(2);
	});

	it("draws half the significant height, stretched by the stated exaggeration", () => {
		const f = swellField(reading(2.5, 10, 0));
		expect(f.amplitude).toBeCloseTo(1.25 * UNITS_PER_M * VERTICAL_EXAGGERATION);
		// Crest to trough is the whole height.
		const heights = [0, 0.25, 0.5, 0.75].map((p) => surfaceHeight(f, 0, 0, p * f.period_s));
		expect(Math.max(...heights) - Math.min(...heights)).toBeCloseTo(2.5 * UNITS_PER_M * VERTICAL_EXAGGERATION);
	});

	it("lies flat at still water for a missing period or height", () => {
		expect(surfaceHeight(swellField(reading(2, 0, 0)), 1, 1, 3)).toBe(0);
		expect(surfaceHeight(swellField(reading(0, 10, 0)), 1, 1, 3)).toBe(0);
		expect(swellField(reading(-1, 10, 0)).amplitude).toBe(0);
	});
});

describe("surfaceHeight in time", () => {
	const f = swellField(reading(1.75, 7.14, 81));

	it("repeats after exactly one wave period", () => {
		for (const [x, z, t] of [
			[0, 0, 0],
			[1.3, -2.2, 4.1],
			[-2.9, 0.7, 17.3],
		]) {
			expect(surfaceHeight(f, x, z, t + f.period_s)).toBeCloseTo(surfaceHeight(f, x, z, t), 10);
		}
	});

	it("advances a crest one wavelength per period, which is the deep-water speed", () => {
		const L = f.wavelength_m * UNITS_PER_M;
		// Follow one crest (the one a wavelength along at t=0) through a quarter period.
		const at0 = crestsAlongTravel(f, 0, L * 2)[0];
		const atQuarter = crestsAlongTravel(f, f.period_s / 4, L * 2).find((s) => s > at0)!;
		expect(atQuarter - at0).toBeCloseTo(L / 4, 3);
		expect(crestSpeedMs(f)).toBeCloseTo(deepWaterSpeedMs(7.14));
	});
});

describe("travel direction", () => {
	it("puts north at -Z and east at +X", () => {
		const n = bearingToSceneVector(0);
		const e = bearingToSceneVector(90);
		expect(n.x).toBeCloseTo(0);
		expect(n.z).toBeCloseTo(-1);
		expect(e.x).toBeCloseTo(1);
		expect(e.z).toBeCloseTo(0);
	});

	it.each([
		[0, 0, 1], // from the north, heading south (+Z)
		[90, -1, 0], // from the east, heading west
		[270, 1, 0], // from the west, heading east
		[315, Math.SQRT1_2, Math.SQRT1_2], // Monterey's NW swell heads southeast
	])("sends a swell from %s degrees toward (%s, %s)", (mwd, x, z) => {
		const { dir } = swellField(reading(1, 10, mwd));
		expect(dir.x).toBeCloseTo(x);
		expect(dir.z).toBeCloseTo(z);
	});

	it("moves crests downwind of where the swell comes from", () => {
		// A west swell: a crest at the origin at t=0 is east (+X) of it a moment later.
		const f = swellField(reading(1, 10, 270));
		const dt = f.period_s / 8;
		const ahead = surfaceHeight(f, (f.wavelength_m * UNITS_PER_M) / 8, 0, dt);
		expect(ahead).toBeCloseTo(f.amplitude, 6);
	});
});

describe("surfaceSlope", () => {
	it.each([
		[37, 7.14, 0, 0, 1.1],
		[163, 13.33, 1.7, -0.4, 6.2],
		[315, 7.14, -2.5, 2.1, 0.3],
	])("matches a finite difference (MWD %s, T %s)", (mwd, T, x, z, t) => {
		const f = swellField(reading(1.9, T, mwd));
		const e = 1e-5;
		const s = surfaceSlope(f, x, z, t);
		expect(s.dx).toBeCloseTo((surfaceHeight(f, x + e, z, t) - surfaceHeight(f, x - e, z, t)) / (2 * e), 5);
		expect(s.dz).toBeCloseTo((surfaceHeight(f, x, z + e, t) - surfaceHeight(f, x, z - e, t)) / (2 * e), 5);
	});
});

describe("forecastTraces", () => {
	it("scales each forecast by forecast / observed height", () => {
		const traces = forecastTraces(1.25, [
			{ wave_height_m: 1.58, color: "#1c6227" },
			{ wave_height_m: 1.14, color: "#37579e" },
			{ wave_height_m: 2.14, color: "#b4820a" },
		]);
		expect(traces.map((t) => t.heightScale)).toEqual([1.58 / 1.25, 1.14 / 1.25, 2.14 / 1.25]);
		expect(traces.map((t) => t.color)).toEqual(["#1c6227", "#37579e", "#b4820a"]);
		expect(traces.every((t) => t.width === FORECAST_TRACE_WIDTH)).toBe(true);
	});

	it("lies flat when there is no observed height to scale against", () => {
		expect(forecastTraces(0, [{ wave_height_m: 1, color: "#000" }])[0].heightScale).toBe(0);
	});
});

describe("buildOceanBlock", () => {
	const f = swellField(reading(1.25, 7.14, 37));
	const traces = forecastTraces(1.25, [
		{ wave_height_m: 1.58, color: "#1c6227" },
		{ wave_height_m: 1.14, color: "#37579e" },
		{ wave_height_m: 2.14, color: "#b4820a" },
	]);
	const block = buildOceanBlock(f, traces);
	const meshes = (kind: string) => {
		const out: Mesh[] = [];
		block.group.traverse((o) => {
			if (o instanceof Mesh && o.userData.kind === kind) out.push(o);
		});
		return out;
	};
	const y = (g: BufferGeometry, v: number) => g.getAttribute("position").getY(v);
	const xz = (g: BufferGeometry, v: number) => [g.getAttribute("position").getX(v), g.getAttribute("position").getZ(v)];

	it("spans the patch and reaches down to the block floor", () => {
		block.update(2.5);
		const box = new Box3();
		for (const m of [...meshes("surface"), ...meshes("wall")]) box.expandByObject(m);
		expect(box.min.x).toBeCloseTo(-TILE / 2);
		expect(box.max.x).toBeCloseTo(TILE / 2);
		expect(box.min.z).toBeCloseTo(-TILE / 2);
		expect(box.max.z).toBeCloseTo(TILE / 2);
		expect(box.min.y).toBeCloseTo(-BLOCK_DEPTH);
	});

	it("moves the top surface with surfaceHeight", () => {
		block.update(3.7);
		const g = meshes("surface")[0].geometry;
		for (const v of [0, 500, 1200, 2400]) {
			const [x, z] = xz(g, v);
			expect(y(g, v)).toBeCloseTo(surfaceHeight(f, x, z, 3.7), 5);
		}
	});

	it("turns every wall outward", () => {
		block.update(0);
		for (const wall of meshes("wall")) {
			const g = wall.geometry;
			const idx = g.getIndex()!;
			const p = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(g.getAttribute("position"), idx.getX(k)));
			const normal = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
			// The wall's fixed coordinate is the one shared by all three corners; outward is its sign.
			const fixedX = p.every((q) => Math.abs(q.x - p[0].x) < 1e-9);
			const outward = fixedX ? new Vector3(Math.sign(p[0].x), 0, 0) : new Vector3(0, 0, Math.sign(p[0].z));
			expect(normal.dot(outward)).toBeGreaterThan(0.99);
		}
	});

	it("draws the real swell and one trace per forecast on all four sides", () => {
		const fills = meshes("trace").filter((m) => !m.userData.edge);
		expect(fills.filter((m) => m.userData.trace === "observed")).toHaveLength(4);
		expect(fills.filter((m) => typeof m.userData.trace === "number")).toHaveLength(4 * traces.length);
	});

	it("draws each forecast trace at forecast / observed times the real surface", () => {
		const t = 1.9;
		block.update(t);
		for (const m of meshes("trace").filter((r) => typeof r.userData.trace === "number" && !r.userData.edge)) {
			const tr = traces[m.userData.trace as number];
			const g = m.geometry;
			for (const sample of [0, 17, 40, 64]) {
				const top = sample * 2;
				const centre = (y(g, top) + y(g, top + 1)) / 2;
				const [x, z] = xz(g, top);
				// The ribbon sits a hair outside the wall; sample the surface at the wall itself.
				const wx = Math.abs(x) > TILE / 2 ? Math.sign(x) * (TILE / 2) : x;
				const wz = Math.abs(z) > TILE / 2 ? Math.sign(z) * (TILE / 2) : z;
				expect(centre).toBeCloseTo(surfaceHeight(f, wx, wz, t) * tr.heightScale, 5);
				expect(y(g, top) - y(g, top + 1)).toBeCloseTo(tr.width, 6);
			}
		}
	});

	it("swaps readings in place without leaving old traces behind", () => {
		const before = meshes("trace").length;
		const g = swellField(reading(0.67, 13.33, 163));
		block.setField(g, forecastTraces(0.67, [{ wave_height_m: 1.88, color: "#b4820a" }]));
		block.update(0);
		const fills = meshes("trace").filter((m) => !m.userData.edge);
		expect(fills).toHaveLength(4 * 2);
		expect(meshes("trace").length).toBeLessThan(before);
		const s = meshes("surface")[0].geometry;
		const [x, z] = xz(s, 300);
		expect(y(s, 300)).toBeCloseTo(surfaceHeight(g, x, z, 0), 5);
	});

	it("puts a scale bar of 100 m steps across the full 400 m on the base", () => {
		const steps = meshes("scale-step");
		expect(steps).toHaveLength(WINDOW_M / SCALE_STEP_M);
		const box = new Box3();
		steps.forEach((s) => box.expandByObject(s));
		expect(box.max.x - box.min.x).toBeGreaterThan(TILE - 0.05);
		expect(box.max.x - box.min.x).toBeLessThanOrEqual(TILE);
	});

	it("disposes without throwing", () => {
		expect(() => block.dispose()).not.toThrow();
	});
});
