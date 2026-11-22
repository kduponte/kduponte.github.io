import { Color, CylinderGeometry, Group, Matrix4, MeshStandardMaterial, Shape, Vector2, Vector3, type Material } from "three";
import { createPartKit, extrude, slab } from "./kit";

/**
 * A classic single-fin longboard, in meters, for the bed of Kyle's build: white, a black-and-white
 * yin-yang and TANAKA on the bottom, a translucent neon green fin. Sized from a T&C longboard's stock
 * dimensions and a 10.5-inch longboard fin, in the raked pivot shape Kyle picked (see
 * truck-builder-options.ts for the sources).
 *
 * Its own frame: +X toward the nose, +Y out of the bottom (the side the fin is on), +Z across.
 */

const INCH = 0.0254;

export interface LongboardSpec {
	lengthM: number;
	widthM: number;
	thicknessM: number;
	finHeightM: number;
}

/** T&C Makani stock size, 9'6" x 23 1/2" x 3 1/2", with a 10.5" fin. */
export const TC_LONGBOARD: LongboardSpec = { lengthM: 114 * INCH, widthM: 23.5 * INCH, thicknessM: 3.5 * INCH, finHeightM: 10.5 * INCH };

const GLYPHS: Record<string, [number, number, number, number][]> = {
	T: [
		[0, 1, 0.75, 1],
		[0.375, 1, 0.375, 0],
	],
	A: [
		[0, 0, 0.375, 1],
		[0.75, 0, 0.375, 1],
		[0.17, 0.36, 0.58, 0.36],
	],
	N: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 0],
		[0.75, 0, 0.75, 1],
	],
	K: [
		[0, 0, 0, 1],
		[0, 0.45, 0.75, 1],
		[0.25, 0.62, 0.75, 0],
	],
};

/**
 * Half the board's width at a fraction of its length from the tail (0) to the nose (1): a classic
 * longboard plan with its wide point just forward of center, a broad round nose and a squarish tail.
 */
export function halfWidthAt(f: number, spec: LongboardSpec = TC_LONGBOARD): number {
	const w = spec.widthM / 2;
	if (f <= 0) return w * 0.6; // tail block, about 14 in across
	if (f >= 1) return 0;
	if (f > 0.9) return w * 0.78 * Math.sqrt(1 - ((f - 0.9) / 0.1) ** 2); // round nose
	const curve = 1 - ((f - 0.52) / 0.52) ** 2;
	return w * (0.6 + 0.4 * Math.max(0, curve));
}

export interface LongboardModel {
	group: Group;
	dispose(): void;
}

export function buildLongboard(spec: LongboardSpec = TC_LONGBOARD): LongboardModel {
	const kit = createPartKit("#111111");
	const { add, std } = kit;
	const white = std("#f5f4ef", 0.3, 0.05);
	const black = std("#141414", 0.4);
	const fin = kit.material(
		new MeshStandardMaterial({ color: new Color("#5cff2e"), roughness: 0.15, metalness: 0, transparent: true, opacity: 0.72, emissive: new Color("#2a8a10"), emissiveIntensity: 0.25 }),
	);

	const group = new Group();
	const L = spec.lengthM;
	const t = spec.thicknessM;

	// Plan outline in XY (x along the board, y across), extruded through its thickness with soft rails.
	const steps = 40;
	const pts: Vector2[] = [];
	for (let i = 0; i <= steps; i++) {
		const f = i / steps;
		pts.push(new Vector2(-L / 2 + f * L, halfWidthAt(f, spec)));
	}
	for (let i = steps; i >= 0; i--) {
		const f = i / steps;
		pts.push(new Vector2(-L / 2 + f * L, -halfWidthAt(f, spec)));
	}
	const outline = new Shape(pts);
	const body = extrude(outline, t, t * 0.42, true);
	body.rotateX(-Math.PI / 2); // across -> Z, thickness -> Y
	add(group, body, white, [0, 0, 0], { outline: 0.012 });
	const face = t / 2 + 0.001;

	// Yin-yang, about 6 in across, toward the tail on the bottom.
	const r = 3 * INCH;
	const yy = new Group();
	yy.position.set(-L * 0.18, face, 0);
	const disc = new CylinderGeometry(r, r, 0.002, 40);
	add(yy, disc, white, [0, 0, 0], { outline: 0.004 });
	const dark = new Shape();
	dark.absarc(0, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false); // left half
	dark.absarc(0, -r / 2, r / 2, (3 * Math.PI) / 2, Math.PI / 2, false); // bulge out on the right
	dark.absarc(0, r / 2, r / 2, (3 * Math.PI) / 2, Math.PI / 2, true); // bite back in on the left
	const darkGeo = extrude(dark, 0.002, 0, false);
	darkGeo.rotateX(-Math.PI / 2);
	add(yy, darkGeo, black, [0, 0.0015, 0], { outline: 0 });
	for (const [z, mat] of [
		[r / 2, white],
		[-r / 2, black],
	] as [number, Material][]) {
		const dot = new CylinderGeometry(r / 6, r / 6, 0.002, 20);
		add(yy, dot, mat, [0, 0.003, z], { outline: 0 });
	}
	// Turn it so the halves split along the board, as decals usually sit.
	yy.rotation.y = Math.PI / 2;
	group.add(yy);

	// TANAKA along the board, between the yin-yang and the nose, reading from the board's right rail.
	const letterH = 2.6 * INCH;
	const stroke = 0.45 * INCH;
	const u = new Vector3(1, 0, 0);
	const n = new Vector3(0, 1, 0);
	const v = new Vector3().crossVectors(n, u); // letters' up, across the board
	const text = "TANAKA";
	const cellW = 0.75 * letterH;
	const gap = 0.3 * letterH;
	const total = text.length * cellW + (text.length - 1) * gap;
	const start = new Vector3(L * 0.08, face + 0.002, 0);
	[...text].forEach((ch, i) => {
		const left = -total / 2 + i * (cellW + gap);
		for (const [u0, v0, u1, v1] of GLYPHS[ch]) {
			const du = (u1 - u0) * letterH;
			const dv = (v1 - v0) * letterH;
			const dir = u.clone().multiplyScalar(du).addScaledVector(v, dv).normalize();
			const side = new Vector3().crossVectors(n, dir);
			const mid = start
				.clone()
				.addScaledVector(u, left + ((u0 + u1) / 2) * letterH)
				.addScaledVector(v, ((v0 + v1) / 2 - 0.5) * letterH);
			const mesh = add(group, slab(Math.hypot(du, dv) + stroke, stroke, 0.002, stroke * 0.3, 0.0005), black, [mid.x, mid.y, mid.z], { outline: 0 });
			mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(dir, side, n));
		}
	});

	// Single fin, a raked "pivot" outline like the Island Fin Design fin Kyle picked: the leading edge
	// sweeps up and back in one long curve, the broad rounded tip rakes well past the base, and the
	// trailing edge is deeply concave. Points traced from that fin, in fractions of its height (a is
	// distance back from the leading foot toward the tail, v is height off the board).
	const h = spec.finHeightM;
	const pt = ([a, v]: [number, number]) => new Vector2(-a * h, v * h);
	const finShape = new Shape();
	finShape.moveTo(0, 0);
	finShape.splineThru(
		(
			[
				[0.167, 0.292],
				[0.3125, 0.542],
				[0.479, 0.771],
				[0.667, 0.927],
				[0.854, 0.99],
				[1.042, 1.0],
				[1.125, 0.969],
				[1.135, 0.9375],
				[1.021, 0.833],
				[0.896, 0.708],
				[0.792, 0.542],
				[0.74, 0.375],
				[0.723, 0.208],
				[0.729, 0],
			] as [number, number][]
		).map(pt),
	);
	finShape.lineTo(0, 0);
	const finGeo = extrude(finShape, 0.009, 0.003, false);
	// Leading foot about 38 cm up from the tail, so the raked tip stays over the board.
	add(group, finGeo, fin, [-L / 2 + 0.38, face - 0.004, 0], { outline: 0.004 });

	return { group, dispose: kit.dispose };
}

/** For placing it: the board's bottom face height above its center, and the fin's tip above that. */
export function boardClearance(spec: LongboardSpec = TC_LONGBOARD) {
	return { halfThickness: spec.thicknessM / 2, finHeight: spec.finHeightM };
}
