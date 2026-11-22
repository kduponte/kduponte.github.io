import {
	BufferGeometry,
	CatmullRomCurve3,
	CircleGeometry,
	Color,
	CylinderGeometry,
	ExtrudeGeometry,
	Group,
	Matrix4,
	MeshStandardMaterial,
	RingGeometry,
	Shape,
	ShapeGeometry,
	TubeGeometry,
	Vector2,
	Vector3,
	type Material,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createPartKit, slab } from "./kit";

/**
 * Kyle's longboard, in meters: a Tommy Tanaka Beach Boy from T&C Surf Designs, the single-fin
 * noserider, in classic white. Its stock 9'4" x 23 1/2" x 3" size, a round nose, a rounded square
 * tail, 50/50 rails, a domed deck, rocker at both ends, a wood stringer, a 10-inch fin box with a
 * translucent neon green pivot fin, and the two decals T&C lays up near the nose on the bottom: the
 * Town & Country Hawaii yin-yang disc and the Tanaka script.
 *
 * Its own frame: +X toward the nose, +Y out of the bottom (the side the fin is on), +Z across, so
 * that seen from the bottom with the nose up, +Z is to the right.
 */

const INCH = 0.0254;

export interface LongboardSpec {
	lengthM: number;
	widthM: number;
	thicknessM: number;
	finHeightM: number;
}

/** Tommy Tanaka's Beach Boy, largest stock size: 9'4" x 23 1/2" x 3" (76.5 L), with a 10.5" fin. */
export const TANAKA_BEACH_BOY: LongboardSpec = { lengthM: 112 * INCH, widthM: 23.5 * INCH, thicknessM: 3 * INCH, finHeightM: 10.5 * INCH };
/** The board the truck carries. */
export const TC_LONGBOARD = TANAKA_BEACH_BOY;

/**
 * Half the board's width at a fraction of its length from the tail (0) to the nose (1): widest just
 * forward of center, about 14.5 in across a foot up from the tail and 17.5 in a foot back from the
 * nose, finishing in a rounded square tail and a round nose.
 */
export function halfWidthAt(f: number, spec: LongboardSpec = TC_LONGBOARD): number {
	const w = spec.widthM / 2;
	if (f <= 0) return w * 0.33;
	if (f >= 1) return 0;
	const tailSide = (x: number) => w * (1 - 0.575 * ((0.52 - x) / 0.52) ** 1.84);
	if (f < 0.03) {
		const edge = tailSide(0.03);
		return w * 0.33 + (edge - w * 0.33) * Math.sqrt(1 - (1 - f / 0.03) ** 2); // rounded tail corners
	}
	if (f <= 0.52) return tailSide(f);
	const noseSide = (x: number) => w * (1 - 0.415 * ((x - 0.52) / 0.48) ** 2);
	if (f <= 0.9) return noseSide(f);
	return noseSide(0.9) * Math.sqrt(1 - ((f - 0.9) / 0.1) ** 2); // round nose
}

/** Thickness as a fraction of the full 3 in: full through the middle, foiled to about half at the ends. */
export function foilAt(f: number): number {
	const x = Math.max(0, Math.min(1, f));
	return x < 0.5 ? 1 - 0.5 * ((0.5 - x) / 0.5) ** 2.5 : 1 - 0.45 * ((x - 0.5) / 0.5) ** 2.5;
}

/** Rocker, meters: how far the board bends toward its deck at each end (more in the nose, a noserider's lift). */
export function rockerAt(f: number): number {
	if (f > 0.6) return 0.08 * ((Math.min(f, 1) - 0.6) / 0.4) ** 2.5;
	if (f < 0.35) return 0.035 * ((0.35 - Math.max(f, 0)) / 0.35) ** 2;
	return 0;
}

/** Deck dome and bottom roll, as fractions of the half thickness at the stringer, easing to nothing at the rails. */
const DECK_DOME = 0.15;
const BOTTOM_ROLL = 0.05;

/**
 * Where the board's surface is, relative to its straight axis: `side` +1 for the bottom, -1 for the
 * deck, at distance x from center and z across.
 */
export function surfaceY(side: 1 | -1, x: number, z: number, spec: LongboardSpec = TC_LONGBOARD): number {
	const f = (x + spec.lengthM / 2) / spec.lengthM;
	const hw = halfWidthAt(f, spec) || 1e-6;
	const zn = Math.min(1, Math.abs(z) / hw);
	const dome = (side > 0 ? BOTTOM_ROLL : DECK_DOME) * (1 - zn * zn);
	return side * (spec.thicknessM / 2) * foilAt(f) * (1 + dome) - rockerAt(f);
}

/** Distance from the board's straight axis down to its deck at the stringer, for resting it deck-down. */
export function deckOffsetAt(f: number, spec: LongboardSpec = TC_LONGBOARD): number {
	return -surfaceY(-1, (f - 0.5) * spec.lengthM, 0, spec);
}

/** A standard single-fin box: 10 in long, 3/4 in wide, set on the stringer. */
export const FIN_BOX = { lengthM: 10 * INCH, widthM: 0.75 * INCH } as const;

// Upper-case stroke glyphs on a 0.75 x 1 cell, for the disc's arched lettering.
const CAPS: Record<string, [number, number, number, number][]> = {
	T: [
		[0, 1, 0.75, 1],
		[0.375, 1, 0.375, 0],
	],
	O: [
		[0.1, 0, 0.65, 0],
		[0.65, 0, 0.75, 0.5],
		[0.75, 0.5, 0.65, 1],
		[0.65, 1, 0.1, 1],
		[0.1, 1, 0, 0.5],
		[0, 0.5, 0.1, 0],
	],
	W: [
		[0, 1, 0.18, 0],
		[0.18, 0, 0.375, 0.6],
		[0.375, 0.6, 0.57, 0],
		[0.57, 0, 0.75, 1],
	],
	N: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 0],
		[0.75, 0, 0.75, 1],
	],
	"&": [
		[0.7, 0, 0.1, 0.75],
		[0.1, 0.75, 0.35, 1],
		[0.35, 1, 0.55, 0.78],
		[0.55, 0.78, 0, 0.3],
		[0, 0.3, 0.2, 0],
		[0.2, 0, 0.5, 0.1],
		[0.5, 0.1, 0.75, 0.4],
	],
	C: [
		[0.75, 1, 0.1, 1],
		[0.1, 1, 0, 0.5],
		[0, 0.5, 0.1, 0],
		[0.1, 0, 0.75, 0],
	],
	U: [
		[0, 1, 0, 0.15],
		[0, 0.15, 0.15, 0],
		[0.15, 0, 0.6, 0],
		[0.6, 0, 0.75, 0.15],
		[0.75, 0.15, 0.75, 1],
	],
	R: [
		[0, 0, 0, 1],
		[0, 1, 0.65, 1],
		[0.65, 1, 0.75, 0.75],
		[0.75, 0.75, 0.6, 0.5],
		[0.6, 0.5, 0, 0.5],
		[0.3, 0.5, 0.75, 0],
	],
	Y: [
		[0, 1, 0.375, 0.5],
		[0.75, 1, 0.375, 0.5],
		[0.375, 0.5, 0.375, 0],
	],
	H: [
		[0, 0, 0, 1],
		[0.75, 0, 0.75, 1],
		[0, 0.5, 0.75, 0.5],
	],
	A: [
		[0, 0, 0.375, 1],
		[0.75, 0, 0.375, 1],
		[0.17, 0.36, 0.58, 0.36],
	],
	I: [[0.375, 0, 0.375, 1]],
};

/**
 * The Tanaka script as pen strokes on a cell with the baseline at 0 and the cap height at 1, before
 * its italic slant: T, a, n, a, k, a, plus the long swash that starts left of the T, runs over the
 * word and hooks down at the end.
 */
const SCRIPT: { pts: [number, number][]; swash?: boolean }[] = [
	{ pts: [[0.55, 0.95], [0.45, 0.5], [0.32, 0.05], [0.2, 0]] }, // T stem
	{ pts: [[1.2, 0.42], [0.98, 0.5], [0.82, 0.3], [0.88, 0.05], [1.08, 0.12], [1.2, 0.42], [1.13, 0.1], [1.25, 0]] }, // a
	{ pts: [[1.32, 0], [1.42, 0.48], [1.52, 0.36], [1.68, 0.5], [1.78, 0.38], [1.72, 0.05], [1.84, 0]] }, // n
	{ pts: [[2.26, 0.42], [2.04, 0.5], [1.88, 0.3], [1.94, 0.05], [2.14, 0.12], [2.26, 0.42], [2.19, 0.1], [2.31, 0]] }, // a
	{ pts: [[2.38, 0], [2.6, 1.0]] }, // k stem
	{ pts: [[2.8, 0.5], [2.5, 0.25], [2.72, 0.12], [2.82, 0]] }, // k arm and leg
	{ pts: [[3.28, 0.42], [3.06, 0.5], [2.9, 0.3], [2.96, 0.05], [3.16, 0.12], [3.28, 0.42], [3.21, 0.1], [3.33, 0]] }, // a
	{ pts: [[-0.55, 0.78], [0.8, 0.98], [2.4, 1.1], [3.5, 1.08], [3.62, 0.92], [3.4, 0.6]], swash: true },
];
const SCRIPT_WIDTH = 4.2;
const ITALIC = 0.32;

export interface LongboardModel {
	group: Group;
	dispose(): void;
}

export function buildLongboard(spec: LongboardSpec = TC_LONGBOARD): LongboardModel {
	const kit = createPartKit("#111111");
	const { add, std } = kit;
	const white = std("#f6f5f0", 0.28, 0.05);
	const black = std("#141414", 0.4);
	const decalWhite = std("#fbfbf8", 0.35);
	const scriptGold = std("#cfdc4a", 0.35, 0.2);
	const wood = std("#8b5a2b", 0.6);
	const boxMat = std("#26282b", 0.5, 0.2);
	const screwMat = std("#cfd3d6", 0.3, 0.8);
	const fin = kit.material(
		new MeshStandardMaterial({ color: new Color("#5cff2e"), roughness: 0.15, metalness: 0, transparent: true, opacity: 0.72, emissive: new Color("#2a8a10"), emissiveIntensity: 0.25 }),
	);

	const group = new Group();
	const L = spec.lengthM;
	const t = spec.thicknessM;

	/**
	 * Smooth a geometry and bend it into the board's shape: merge its vertices so it shades round,
	 * then give every vertex the foil, dome and rocker of its station.
	 */
	const shapeBoard = (geo: BufferGeometry) => {
		geo.deleteAttribute("normal");
		geo.deleteAttribute("uv");
		const merged = mergeVertices(geo, 1e-5);
		geo.dispose();
		const pos = merged.getAttribute("position");
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i);
			const y = pos.getY(i);
			const z = pos.getZ(i);
			const f = (x + L / 2) / L;
			const zn = Math.min(1, Math.abs(z) / (halfWidthAt(f, spec) || 1e-6));
			const dome = (y > 0 ? BOTTOM_ROLL : DECK_DOME) * (1 - zn * zn);
			pos.setY(i, y * foilAt(f) * (1 + dome) - rockerAt(f));
		}
		pos.needsUpdate = true;
		merged.computeVertexNormals();
		return merged;
	};
	const extrudeThrough = (shape: Shape, depth: number, bevel: number) => {
		const core = Math.max(depth - 2 * bevel, 1e-4);
		const geo = new ExtrudeGeometry(shape, {
			depth: core,
			bevelEnabled: bevel > 0,
			bevelThickness: bevel,
			bevelSize: bevel,
			bevelOffset: -bevel,
			bevelSegments: 8,
			curveSegments: 24,
		});
		geo.translate(0, 0, -core / 2);
		geo.rotateX(-Math.PI / 2); // across -> Z, thickness -> Y
		return geo;
	};

	// Body: the plan outline, extruded through the thickness with fully rounded 50/50 rails.
	const steps = 120;
	const outlinePts: Vector2[] = [];
	for (let i = 0; i <= steps; i++) outlinePts.push(new Vector2(-L / 2 + (i / steps) * L, halfWidthAt(i / steps, spec)));
	for (let i = steps; i >= 0; i--) outlinePts.push(new Vector2(-L / 2 + (i / steps) * L, -halfWidthAt(i / steps, spec)));
	add(group, shapeBoard(extrudeThrough(new Shape(outlinePts), t, t * 0.4)), white, [0, 0, 0], { outline: 0.01 });

	// Wood stringer down the center line, through the board and just proud of both faces.
	const stringerW = 0.25 * INCH;
	const run: Vector2[] = [];
	for (let i = 0; i <= 80; i++) run.push(new Vector2(-L / 2 + 0.03 + (i / 80) * (L - 0.06), -stringerW / 2));
	for (let i = 80; i >= 0; i--) run.push(new Vector2(-L / 2 + 0.03 + (i / 80) * (L - 0.06), stringerW / 2));
	add(group, shapeBoard(extrudeThrough(new Shape(run), t + 0.003, 0)), wood, [0, 0, 0], { outline: 0 });

	/** Height of the bottom face (it's the side facing up when the board rides deck down). */
	const faceAt = (x: number, z = 0) => surfaceY(1, x, z, spec) + 0.0015;
	const frac = (fromNose: number) => L / 2 - fromNose * L;

	/**
	 * A flat decal frame lying on the bottom: local x across the board (+Z), local y toward the nose
	 * (+X), local z out of the surface (+Y).
	 */
	const decal = (x: number, z: number) => {
		const g = new Group();
		g.position.set(x, faceAt(x, z), z);
		g.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)));
		group.add(g);
		return g;
	};
	const flat = (parent: Group, geo: BufferGeometry, mat: Material, lift: number) => add(parent, geo, mat, [0, 0, lift], { outline: 0 });
	/** A stroke from (u0,v0) to (u1,v1) in a decal's plane. */
	const stroke = (parent: Group, u0: number, v0: number, u1: number, v1: number, w: number, mat: Material, lift: number) => {
		const len = Math.hypot(u1 - u0, v1 - v0);
		const mesh = add(parent, slab(len + w, w, 0.0008, w * 0.4, 0.0002), mat, [(u0 + u1) / 2, (v0 + v1) / 2, lift], { outline: 0 });
		mesh.rotation.z = Math.atan2(v1 - v0, u1 - u0);
	};

	// --- Town & Country Hawaii disc: white, black rings, arched lettering, the yin-yang in the middle ---
	const R = 3.5 * INCH; // a 7 in decal
	const disc = decal(frac(0.228), -0.11);
	flat(disc, new CircleGeometry(R, 48), decalWhite, 0);
	flat(disc, new RingGeometry(R * 0.92, R, 48), black, 0.0004);
	flat(disc, new RingGeometry(R * 0.62, R * 0.655, 48), black, 0.0004);
	const yy = R * 0.62;
	const dark = new Shape();
	// Black on the right with its head at the top, the white head bulging into it at the bottom.
	dark.absarc(0, 0, yy, Math.PI / 2, -Math.PI / 2, true);
	dark.absarc(0, -yy / 2, yy / 2, -Math.PI / 2, Math.PI / 2, false);
	dark.absarc(0, yy / 2, yy / 2, -Math.PI / 2, Math.PI / 2, true);
	flat(disc, new ShapeGeometry(dark, 32), black, 0.0006);
	flat(disc, new CircleGeometry(yy / 6.5, 20).translate(0, yy / 2, 0), decalWhite, 0.0009);
	flat(disc, new CircleGeometry(yy / 6.5, 20).translate(0, -yy / 2, 0), black, 0.0009);
	/** Letters around the band: centered on `mid` (radians), reading clockwise on top, upright on the bottom. */
	const arcText = (text: string, mid: number, top: boolean) => {
		const radius = R * 0.775;
		const h = R * 0.15;
		const sw = h * 0.16;
		const step = (h * 0.95) / radius;
		[...text].forEach((ch, i) => {
			const a = top ? mid + ((text.length - 1) / 2 - i) * step : mid - ((text.length - 1) / 2 - i) * step;
			const cx = Math.cos(a) * radius;
			const cy = Math.sin(a) * radius;
			// Letter axes: up points out of the disc on top, in toward the center at the bottom.
			const up = new Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(top ? 1 : -1);
			const right = new Vector2(up.y, -up.x);
			for (const [u0, v0, u1, v1] of CAPS[ch] ?? []) {
				const p = (u: number, v: number) => new Vector2(cx, cy).addScaledVector(right, (u - 0.375) * h).addScaledVector(up, (v - 0.5) * h);
				const a0 = p(u0, v0);
				const a1 = p(u1, v1);
				stroke(disc, a0.x, a0.y, a1.x, a1.y, sw, black, 0.0007);
			}
		});
	};
	arcText("TOWN & COUNTRY", Math.PI / 2, true);
	arcText("HAWAII", -Math.PI / 2, false);

	// --- Tanaka script under the disc: black strokes with a yellow-green inline, slanted ---
	const scriptW = 8 * INCH;
	const capH = scriptW / SCRIPT_WIDTH;
	const tan = decal(frac(0.289), -0.08);
	for (const s of SCRIPT) {
		const pts = s.pts.map(([u, v]) => new Vector3((u - SCRIPT_WIDTH / 2 + 0.5 + ITALIC * v) * capH, (v - 0.5) * capH, 0));
		const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.3);
		const seg = Math.max(12, pts.length * 10);
		const r = capH * (s.swash ? 0.06 : 0.085);
		add(tan, new TubeGeometry(curve, seg, r, 6, false), black, [0, 0, 0.001], { outline: 0 });
		add(tan, new TubeGeometry(curve, seg, r * 0.45, 6, false), scriptGold, [0, 0, 0.001 + r * 0.7], { outline: 0 });
	}

	// --- Fin box and the pivot fin ---
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
	const finGeo = new ExtrudeGeometry(finShape, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 3, curveSegments: 40 });
	finGeo.translate(0, 0, -0.0025);
	// Leading foot about 38 cm up from the tail, so the raked tip stays over the board; the fin stands in
	// its box, which runs a little past the fin's base at both ends, with the screw plate at the back.
	const finLead = -L / 2 + 0.38;
	const baseMid = finLead - 0.729 * h * 0.5;
	const boxMid = baseMid + 0.01;
	const boxTilt = Math.atan2(faceAt(boxMid + 0.05) - faceAt(boxMid - 0.05), 0.1);
	add(group, slab(FIN_BOX.lengthM, 0.004, FIN_BOX.widthM + 0.008, 0.008, 0.001), boxMat, [boxMid, faceAt(boxMid) + 0.0015, 0], { rot: [0, 0, boxTilt], outline: 0.003 });
	add(group, new CylinderGeometry(0.006, 0.006, 0.004, 14), screwMat, [boxMid - FIN_BOX.lengthM / 2 + 0.012, faceAt(boxMid - FIN_BOX.lengthM / 2 + 0.012) + 0.003, 0], {
		rot: [0, 0, boxTilt],
		outline: 0,
	});
	add(group, finGeo, fin, [finLead, faceAt(baseMid) - 0.002, 0], { rot: [0, 0, boxTilt], outline: 0.004 });

	return { group, dispose: kit.dispose };
}
