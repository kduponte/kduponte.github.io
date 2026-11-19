import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	INCH,
	RING,
	RING_STRIDE,
	STATIONS,
	VERTEX_COUNT,
	blendPositions,
	bottomPoint,
	bounds,
	calibrateBoard,
	createTopology,
	halfWidthIn,
	litersOf,
	meshVolume,
	prepareBoard,
	scaleToLiters,
	writeBlobPositions,
	writeGridNormals,
	writeShellPositions,
} from "../../src/lib/three/surfboard-morph";
import { resolveBoards, type IconicBoardData } from "../../src/lib/surf-volume/iconic-boards";
import type { ComparisonResult } from "../../src/lib/surf-volume/types";

const PUBLIC = path.resolve(import.meta.dirname, "../../public/data/surf-volume");
const data: IconicBoardData = JSON.parse(readFileSync(path.join(PUBLIC, "iconic_boards.json"), "utf-8"));
const summary: ComparisonResult = JSON.parse(readFileSync(path.join(PUBLIC, "profile_summary.json"), "utf-8"));
const resolved = resolveBoards(data, summary.consensus, summary.rows);
const calibrated = resolved.map((r) => ({ r, cal: calibrateBoard(r.shape, r.size.volume_l) }));

describe("shared topology", () => {
	const topo = createTopology();

	it("has one vertex per station and ring point, with a seam duplicate", () => {
		expect(topo.s).toHaveLength(STATIONS);
		expect(topo.t).toHaveLength(RING_STRIDE);
		expect(topo.uv).toHaveLength(VERTEX_COUNT * 2);
		expect(topo.index).toHaveLength((STATIONS - 1) * RING * 6);
	});

	it("runs nose to tail and rail to rail", () => {
		expect(topo.s[0]).toBe(0);
		expect(topo.s[STATIONS - 1]).toBeCloseTo(1, 6);
		expect(topo.t[0]).toBe(1);
		expect(topo.t[RING / 2]).toBe(-1);
	});

	it("is wound outward: a unit sphere on the grid has positive volume near 4/3 pi", () => {
		const pos = new Float32Array(VERTEX_COUNT * 3);
		for (let i = 0; i < STATIONS; i++) {
			const th = Math.PI * topo.s[i];
			for (let j = 0; j < RING_STRIDE; j++) {
				const k = (i * RING_STRIDE + j) * 3;
				pos[k] = Math.cos(th);
				pos[k + 1] = Math.sin(th) * topo.sinPhi[j];
				pos[k + 2] = Math.sin(th) * topo.t[j];
			}
		}
		expect(meshVolume(pos, topo.index)).toBeGreaterThan(0.99 * (4 / 3) * Math.PI);
		expect(meshVolume(pos, topo.index)).toBeLessThan((4 / 3) * Math.PI);
	});
});

describe.each(calibrated)("$r.board.name", ({ r, cal }) => {
	const [minX, minY, minZ, maxX, maxY, maxZ] = bounds(cal.positions);

	it("holds exactly its published liters", () => {
		expect(litersOf(cal.positions)).toBeCloseTo(r.size.volume_l, 2);
	});

	it("calibrates to a believable rail fullness (sections neither diamonds nor bricks)", () => {
		expect(cal.fullness).toBeGreaterThan(0.6);
		expect(cal.fullness).toBeLessThan(3);
	});

	it("is as long and as wide as the spec sheet", () => {
		// Length along the board is measured flat; rocker barely shortens the chord.
		expect((maxX - minX) / INCH).toBeGreaterThan(r.lengthIn * 0.995);
		expect((maxX - minX) / INCH).toBeLessThanOrEqual(r.lengthIn + 1e-3);
		expect((maxZ - minZ) / INCH).toBeCloseTo(r.size.width_in, 1);
	});

	it("is as thick as the spec sheet at its thickest point", () => {
		const p = cal.prepared;
		let thickest = 0;
		const topo = createTopology();
		for (let i = 0; i < STATIONS; i++) {
			const top = cal.positions[(i * RING_STRIDE + RING / 4) * 3 + 1];
			const bottom = cal.positions[(i * RING_STRIDE + (3 * RING) / 4) * 3 + 1];
			thickest = Math.max(thickest, top - bottom);
		}
		// Ring points at phi = 90 and 270 degrees sit on the stringer; stations are discrete.
		expect(thickest / INCH).toBeGreaterThan(r.size.thickness_in * 0.99);
		expect(thickest / INCH).toBeLessThanOrEqual(r.size.thickness_in + 1e-3);
		expect(p.shape.thicknessIn).toBe(r.size.thickness_in);
		expect(topo.s.length).toBe(STATIONS);
	});

	it("sits on its rocker: the flat spot touches y = 0 and the nose lifts by its rocker", () => {
		expect(minY).toBeGreaterThan(-1e-6);
		expect(minY).toBeLessThan(0.002);
		expect(maxY / INCH).toBeGreaterThan(r.shape.rocker.noseIn);
	});

	it("passes its estimated nose and tail widths 12 inches from the ends", () => {
		const p = cal.prepared;
		expect(2 * halfWidthIn(p, p.halfL - 12)).toBeCloseTo(r.shape.noseWidth12In, 3);
		expect(2 * halfWidthIn(p, -p.halfL + 12)).toBeCloseTo(r.shape.tailWidth12In, 3);
	});

	it("mounts fins on the bottom surface", () => {
		for (const fin of r.board.shape.fin_layout) {
			const [x, y, z] = bottomPoint(cal, -cal.prepared.halfL + fin.from_tail_in, fin.off_center_in);
			// A swallow's notch pulls off-center tail points forward a fraction of an inch.
			expect(Math.abs(x / INCH - (-cal.prepared.halfL + fin.from_tail_in))).toBeLessThan(0.25);
			expect(z / INCH).toBeCloseTo(fin.off_center_in, 2);
			// On the bottom: above the flat spot, below the deck (side fins sit near the rail).
			expect(y).toBeGreaterThanOrEqual(-1e-6);
			expect(y).toBeLessThan((r.shape.rocker.tailIn + r.shape.thicknessIn) * INCH);
		}
	});
});

describe("the sting step", () => {
	const sting = calibrated.find((c) => c.r.shape.sting);
	it("narrows the outline behind the step", () => {
		expect(sting).toBeDefined();
		const p = sting!.cal.prepared;
		const xStep = p.xStep!;
		const before = halfWidthIn(p, xStep + 0.01);
		const after = halfWidthIn(p, xStep - p.stepRamp);
		// A smooth outline would lose well under 2% of its width over the ramp; the step loses ~9%.
		expect(after / before).toBeLessThan(1 - 0.8 * p.stepDrop);
	});
});

describe("the blob", () => {
	const pos = new Float32Array(VERTEX_COUNT * 3);

	it.each([24.25, 43.3, 61.6, 84.4])("holds exactly %s L at rest", (liters) => {
		writeBlobPositions(pos, { liters });
		expect(litersOf(pos)).toBeCloseTo(liters, 3);
		expect(bounds(pos)[1]).toBeCloseTo(0, 6);
	});

	it("keeps its liters while wobbling and squashed", () => {
		for (const time of [0, 0.7, 2.3]) {
			writeBlobPositions(pos, { liters: 44.5, time, wobble: 0.08, squash: 0.7, offset: [0.2, 0.1, 0] });
			expect(litersOf(pos)).toBeCloseTo(44.5, 3);
			expect(bounds(pos)[1]).toBeCloseTo(0.1, 6);
		}
	});

	it("grows with its liters by the cube root", () => {
		writeBlobPositions(pos, { liters: 30 });
		const small = bounds(pos);
		writeBlobPositions(pos, { liters: 60 });
		const big = bounds(pos);
		expect((big[3] - big[0]) / (small[3] - small[0])).toBeCloseTo(Math.cbrt(2), 3);
	});
});

describe("morphing", () => {
	const { cal } = calibrated[0];
	const blob = writeBlobPositions(new Float32Array(VERTEX_COUNT * 3), { liters: cal.liters });
	const out = new Float32Array(VERTEX_COUNT * 3);

	const maxDiff = (a: Float32Array, b: Float32Array) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - b[k])), 0);

	it("starts at the blob and ends at the board", () => {
		expect(maxDiff(blendPositions(blob, cal.positions, 0, out), blob)).toBe(0);
		expect(maxDiff(blendPositions(blob, cal.positions, 1, out), cal.positions)).toBe(0);
	});

	it("can be pulled back to the target liters mid-morph", () => {
		blendPositions(blob, cal.positions, 0.5, out);
		scaleToLiters(out, cal.liters, [0, 0, 0]);
		expect(litersOf(out)).toBeCloseTo(cal.liters, 3);
	});

	it("gets continuous unit normals and an outline shell outside the surface", () => {
		const normals = writeGridNormals(cal.positions, new Float32Array(VERTEX_COUNT * 3));
		for (let k = 0; k < normals.length; k += 3) {
			expect(Math.hypot(normals[k], normals[k + 1], normals[k + 2])).toBeCloseTo(1, 4);
		}
		// The seam duplicate shares its twin's normal.
		for (let i = 0; i < STATIONS; i++) {
			const a = i * RING_STRIDE * 3;
			const b = (i * RING_STRIDE + RING) * 3;
			expect(normals[b]).toBeCloseTo(normals[a], 6);
			expect(normals[b + 1]).toBeCloseTo(normals[a + 1], 6);
		}
		const shell = writeShellPositions(cal.positions, normals, 0.02, new Float32Array(VERTEX_COUNT * 3));
		expect(litersOf(shell)).toBeGreaterThan(cal.liters);
	});

	it("never cracks the shell where deck and bottom meet at the tail", () => {
		for (const { cal: board } of calibrated) {
			const normals = writeGridNormals(board.positions, new Float32Array(VERTEX_COUNT * 3));
			const last = (STATIONS - 1) * RING_STRIDE;
			for (let j = 1; j < RING / 2; j++) {
				const a = (last + j) * 3;
				const b = (last + RING - j) * 3;
				expect(normals[a]).toBeCloseTo(normals[b], 6);
				expect(normals[a + 1]).toBeCloseTo(normals[b + 1], 6);
			}
		}
	});
});

describe("true relative scale", () => {
	it("keeps every board in meters from its real length", () => {
		for (const { r, cal } of calibrated) {
			const b = bounds(cal.positions);
			expect((b[3] - b[0]) / (r.lengthIn * INCH)).toBeGreaterThan(0.995);
		}
	});

	it("prepares shapes without NaNs anywhere on the grid", () => {
		for (const { cal } of calibrated) {
			expect(cal.positions.every(Number.isFinite)).toBe(true);
			expect(Object.values(prepareBoard(cal.prepared.shape)).every((v) => typeof v !== "number" || Number.isFinite(v))).toBe(true);
		}
	});
});
