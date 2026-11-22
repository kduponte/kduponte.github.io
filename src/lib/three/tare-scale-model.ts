/**
 * The Noise Problem's hero: a mechanical kitchen scale, the page's own "tare" analogy, weighing one
 * seeded run of the page's live CUPED experiment.
 *
 * - The glass bowl holds one ball per visitor, in arrival order from the bottom up (cream for
 *   control, cobalt for treatment). `setVisitors(n)` shows the first n: the experiment so far.
 * - The dial reads the measured lift, B - A, in points: the needle is the estimate and the shaded
 *   band its 95% interval. Zero sits at twelve o'clock, so a band that covers the top is a result
 *   that isn't significant yet. The scale's range is the readings' own (see cuped-readings.ts).
 * - The lime TARE button latches down while the reading is CUPED-adjusted: the part of each
 *   visitor's metric their pre-period value predicted has been taken off, like a bowl's weight.
 *
 * Built with the shared kit (black inverted-hull outlines, PBR materials) in scene units, the body
 * about 2.2 wide. The dial face and button label are canvas textures painted in the browser and
 * passed in; without them (in Node tests) those parts are plain. Pure: no renderer, no DOM.
 */
import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	DynamicDrawUsage,
	FrontSide,
	Group,
	InstancedMesh,
	LatheGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	Shape,
	SphereGeometry,
	TorusGeometry,
	Vector2,
	Vector3,
	type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { frameVertically } from "./framing";
import { createPartKit, extrude, outlineGeometry } from "./kit";
import type { ScaleReadings } from "../stats-sim/cuped-readings";
import type { Arm } from "../stats-sim/cuped-visitors";

export interface TareScaleColors {
	body: string;
	face: string;
	ink: string;
	steel: string;
	button: string;
	control: string;
	treatment: string;
	/** Interval band, raw and CUPED-adjusted (the page's chart colors for the two). */
	rawBand: string;
	cupedBand: string;
	glass: string;
}

export const DEFAULT_TARE_SCALE_COLORS: TareScaleColors = {
	body: "#ff5a1f",
	face: "#f6f1e4",
	ink: "#111111",
	steel: "#c9c9c4",
	button: "#c8ff3d",
	control: "#f6f1e4",
	treatment: "#2438ff",
	rawBand: "#4a463b",
	cupedBand: "#2438ff",
	glass: "#eafff4",
};

// Body: a rounded trapezoid seen from the front, extruded front to back.
const FOOT_H = 0.08;
const BODY_W_BOTTOM = 2.2;
const BODY_W_TOP = 1.8;
const BODY_H = 1.55;
const BODY_D = 1.5;
const BODY_R = 0.26;
const BODY_LINE = 0.04;
const SMALL_LINE = 0.02;
export const BODY_FRONT_Z = BODY_D / 2;
const BODY_TOP_Y = FOOT_H + BODY_H;

// Dial.
export const DIAL_R = 0.6;
export const DIAL_CENTER = new Vector3(0, FOOT_H + BODY_H * 0.53, BODY_FRONT_Z);
/** Total sweep of the scale, radians; the gap at the bottom carries the units. */
export const DIAL_SWEEP = (300 * Math.PI) / 180;
/** Interval band and needle, as fractions of the dial radius. */
export const BAND_INNER = 0.47;
export const BAND_OUTER = 0.63;
const BAND_EDGE = 0.018;
const NEEDLE_TIP = 0.93;
const NEEDLE_TAIL = 0.12;
const ARC_SEGMENTS = 96;

// Tare button, front right below the dial.
const BUTTON_R = 0.14;
const BUTTON_POS = new Vector3(0.78, FOOT_H + 0.36, BODY_FRONT_Z);
const BUTTON_TRAVEL = 0.045;

// Pan and glass bowl on top.
const PAN_R = 0.95;
const PAN_Y = BODY_TOP_Y + 0.1;
export const BOWL_R = 0.8;
export const BOWL_H = 0.62;
const BOWL_WALL = 0.02;
export const BALL_R = 0.034;
const BALL_LINE = 0.009;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface TareScaleModel {
	/** Origin on the floor under the body's center. */
	group: Group;
	balls: InstancedMesh;
	ballOutlines: InstancedMesh;
	/** A soft round ground shadow, meant to sit outside whatever turns the model. */
	shadow: Mesh;
	framing: { target: Vector3; turnRadius: number; halfHeight: number; viewDir: Vector3 };
	/** Dial angle of a lift, radians clockwise from twelve o'clock (clamped to the scale). */
	angleOf(lift: number): number;
	/** Point the needle at `lift` and shade `low`..`high`; `mix` blends the band from raw (0) to CUPED (1). */
	setReading(lift: number, low: number, high: number, mix: number): void;
	/** Show the first n visitors in the bowl. */
	setVisitors(n: number): void;
	/** How far the TARE button is pushed in, 0 to 1. */
	setPressed(p: number): void;
	/** Current needle angle and band end angles, for tests and readouts. */
	state(): { needle: number; band: [number, number]; visitors: number };
	/** Every ball's resting center in the bowl, in group coordinates, arrival order. */
	ballCenters: Vector3[];
	parts: Mesh[];
	dispose(): void;
}

/** A polygon with each corner rounded by a quadratic curve. */
function roundedPolygon(points: Vector2[], r: number): Shape {
	const shape = new Shape();
	const n = points.length;
	points.forEach((p, i) => {
		const prev = points[(i + n - 1) % n];
		const next = points[(i + 1) % n];
		const a = p.clone().add(prev.clone().sub(p).setLength(r));
		const b = p.clone().add(next.clone().sub(p).setLength(r));
		if (i === 0) shape.moveTo(a.x, a.y);
		else shape.lineTo(a.x, a.y);
		shape.quadraticCurveTo(p.x, p.y, b.x, b.y);
	});
	shape.closePath();
	return shape;
}

/** The bowl's outer profile, bottom center to rim: a squashed half-ellipse. */
function bowlProfile(steps = 24): Vector2[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = (i / steps) * (Math.PI / 2);
		return new Vector2(Math.max(1e-4, BOWL_R * Math.sin(t)), BOWL_H * (1 - Math.cos(t)));
	});
}

/**
 * Resting centers for n balls inside the bowl, lowest first: face-centered-cubic layers, each layer
 * filled from the middle out, kept a ball's radius inside the glass. Pure geometry; arrival order
 * is the only thing it encodes.
 */
export function packBowl(n: number): Vector3[] {
	const a = BOWL_R - BOWL_WALL - BALL_R;
	const c = BOWL_H - BOWL_WALL - BALL_R;
	const d = 2 * BALL_R;
	const layerH = d * Math.sqrt(2 / 3);
	const out: Vector3[] = [];
	for (let k = 0; out.length < n; k++) {
		const y = BOWL_WALL + BALL_R + k * layerH;
		if (y > BOWL_H) throw new Error(`The bowl holds fewer than ${n} balls`);
		// Inside the ellipsoid (x^2 + z^2)/a^2 + (y - BOWL_H)^2/c^2 <= 1 at this height.
		const dy = (y - BOWL_H) / c;
		const rMax = a * Math.sqrt(Math.max(0, 1 - dy * dy));
		const layer: Vector3[] = [];
		const ox = (k % 3) * (d / 2);
		const oz = (k % 3) * (d / (2 * Math.sqrt(3)));
		const span = Math.ceil(rMax / d) + 2;
		for (let i = -span; i <= span; i++) {
			for (let j = -span; j <= span; j++) {
				const x = (i + (j % 2) * 0.5) * d + ox;
				const z = j * d * (Math.sqrt(3) / 2) + oz;
				if (Math.hypot(x, z) <= rMax) layer.push(new Vector3(x, y, z));
			}
		}
		layer.sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z) || Math.atan2(p.z, p.x) - Math.atan2(q.z, q.x));
		out.push(...layer);
	}
	return out.slice(0, n);
}

export interface TareScaleOptions {
	colors?: TareScaleColors;
	/** Painted dial face (ticks, numbers, true-lift mark). */
	faceMap?: Texture;
	/** Painted TARE label for the button cap. */
	buttonMap?: Texture;
	/** The camera's direction from the target. */
	viewDir?: Vector3;
}

export function buildTareScale(readings: ScaleReadings, arms: Arm[], opts: TareScaleOptions = {}): TareScaleModel {
	const colors = opts.colors ?? DEFAULT_TARE_SCALE_COLORS;
	const viewDir = (opts.viewDir ?? new Vector3(0, 0.3, 1)).clone().normalize();
	const kit = createPartKit(colors.ink);
	const group = new Group();
	const max = readings.dialMax;

	// Feet and body.
	const footMat = kit.std(colors.ink, 0.7);
	const footGeo = () => new CylinderGeometry(0.1, 0.11, FOOT_H, 20);
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) kit.add(group, footGeo(), footMat, [sx * (BODY_W_BOTTOM / 2 - 0.25), FOOT_H / 2, sz * (BODY_D / 2 - 0.22)], { outline: SMALL_LINE });
	}
	const bodyShape = roundedPolygon(
		[new Vector2(-BODY_W_BOTTOM / 2, 0), new Vector2(BODY_W_BOTTOM / 2, 0), new Vector2(BODY_W_TOP / 2, BODY_H), new Vector2(-BODY_W_TOP / 2, BODY_H)],
		BODY_R,
	);
	const bodyMat = kit.std(colors.body, 0.42);
	kit.add(group, extrude(bodyShape, BODY_D, 0.06, false), bodyMat, [0, FOOT_H, 0], { outline: BODY_LINE });

	// Dial: bezel, face, interval band (with a black edge), needle and hub.
	const dial = new Group();
	dial.position.copy(DIAL_CENTER);
	group.add(dial);
	const steelMat = kit.std(colors.steel, 0.28, 0.85);
	kit.add(dial, new TorusGeometry(DIAL_R + 0.035, 0.045, 14, 96), steelMat, [0, 0, 0.02], { outline: SMALL_LINE });
	const faceMat = kit.std(colors.face, 0.6);
	if (opts.faceMap) faceMat.map = opts.faceMap;
	kit.add(dial, new CircleGeometry(DIAL_R, 96), faceMat, [0, 0, 0.012], { outline: 0 });

	const arcIndex: number[] = [];
	for (let k = 0; k < ARC_SEGMENTS; k++) {
		const i = 2 * k;
		arcIndex.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
	}
	const makeArc = (z: number, mat: MeshBasicMaterial) => {
		const geo = kit.geometry(new BufferGeometry());
		const pos = new BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 2 * 3), 3).setUsage(DynamicDrawUsage);
		geo.setAttribute("position", pos);
		geo.setIndex(arcIndex);
		const mesh = new Mesh(geo, mat);
		mesh.position.z = z;
		mesh.frustumCulled = false;
		dial.add(mesh);
		return pos;
	};
	// The ring winds clockwise as the angle grows, so draw both sides.
	const bandEdgeMat = kit.material(new MeshBasicMaterial({ color: colors.ink, side: DoubleSide }));
	const bandMat = kit.material(new MeshBasicMaterial({ color: colors.rawBand, side: DoubleSide }));
	const bandEdge = makeArc(0.016, bandEdgeMat);
	const band = makeArc(0.02, bandMat);
	const writeArc = (attr: BufferAttribute, a0: number, a1: number, rIn: number, rOut: number) => {
		const arr = attr.array as Float32Array;
		for (let k = 0; k <= ARC_SEGMENTS; k++) {
			const a = a0 + ((a1 - a0) * k) / ARC_SEGMENTS;
			const sx = Math.sin(a);
			const cy = Math.cos(a);
			arr.set([sx * rIn, cy * rIn, 0, sx * rOut, cy * rOut, 0], k * 6);
		}
		attr.needsUpdate = true;
	};
	const rawColor = new Color(colors.rawBand);
	const cupedColor = new Color(colors.cupedBand);

	const needle = new Group();
	needle.position.z = 0.045;
	dial.add(needle);
	const needleShape = roundedPolygon(
		[
			new Vector2(-0.032, -NEEDLE_TAIL * DIAL_R),
			new Vector2(0.032, -NEEDLE_TAIL * DIAL_R),
			new Vector2(0.009, NEEDLE_TIP * DIAL_R),
			new Vector2(-0.009, NEEDLE_TIP * DIAL_R),
		],
		0.008,
	);
	const inkMat = kit.std(colors.ink, 0.45);
	kit.add(needle, extrude(needleShape, 0.018, 0.004, false), inkMat, [0, 0, 0], { outline: 0.008 });
	kit.add(dial, new CylinderGeometry(0.055, 0.055, 0.05, 24), steelMat, [0, 0, 0.06], { outline: SMALL_LINE, rot: [Math.PI / 2, 0, 0] });

	// TARE button: a lime cap that latches in while the reading is tared.
	const button = new Group();
	button.position.copy(BUTTON_POS);
	group.add(button);
	const buttonMat = kit.std(colors.button, 0.45);
	kit.add(button, new CylinderGeometry(BUTTON_R, BUTTON_R, 0.12, 32), buttonMat, [0, 0, 0.02], { outline: SMALL_LINE, rot: [Math.PI / 2, 0, 0] });
	const labelMat = kit.std(colors.button, 0.45);
	if (opts.buttonMap) labelMat.map = opts.buttonMap;
	kit.add(button, new CircleGeometry(BUTTON_R * 0.98, 32), labelMat, [0, 0, 0.081], { outline: 0 });
	const buttonRestZ = BUTTON_POS.z;

	// Pan on a short neck.
	kit.add(group, new CylinderGeometry(0.28, 0.32, PAN_Y - BODY_TOP_Y, 24), steelMat, [0, (BODY_TOP_Y + PAN_Y) / 2, 0], { outline: SMALL_LINE });
	kit.add(group, new CylinderGeometry(PAN_R, PAN_R * 0.97, 0.06, 64), steelMat, [0, PAN_Y + 0.03, 0], { outline: SMALL_LINE });
	const bowlY = PAN_Y + 0.06;

	// Visitors: one ball each, in arrival order from the bottom of the bowl up.
	const n = arms.length;
	const ballCenters = packBowl(n).map((p) => p.setY(p.y + bowlY));
	const ballGeo = kit.geometry(new SphereGeometry(BALL_R, 12, 8));
	const balls = new InstancedMesh(ballGeo, kit.std("#ffffff", 0.38), n);
	const ballOutlines = new InstancedMesh(kit.geometry(outlineGeometry(ballGeo, BALL_LINE)), kit.material(new MeshBasicMaterial({ color: colors.ink, side: BackSide })), n);
	ballOutlines.instanceMatrix = balls.instanceMatrix;
	const control = new Color(colors.control);
	const treatment = new Color(colors.treatment);
	const matrices = balls.instanceMatrix.array as Float32Array;
	ballCenters.forEach((p, i) => {
		matrices.set([p.x, p.y, p.z], i * 16 + 12);
		balls.setColorAt(i, arms[i] === "A" ? control : treatment);
	});
	balls.frustumCulled = ballOutlines.frustumCulled = false;
	group.add(balls, ballOutlines);

	// Glass bowl. Its outline is a silhouette only: a depth-only pass of the closed bowl (drawn after
	// the balls) hides the outline shell everywhere inside the bowl's outline, so the shell shows
	// just around the edge, and the glass itself is drawn last without writing depth.
	const profile = bowlProfile();
	const outer = kit.geometry(new LatheGeometry(profile, 64));
	const cap = new CircleGeometry(BOWL_R, 64);
	cap.rotateX(-Math.PI / 2);
	cap.translate(0, BOWL_H, 0);
	const hull = kit.geometry(mergeGeometries([outer.clone().toNonIndexed(), cap.toNonIndexed()]));
	cap.dispose();
	const prepass = new Mesh(hull, kit.material(new MeshBasicMaterial({ colorWrite: false })));
	const shell = new Mesh(kit.geometry(outlineGeometry(hull, SMALL_LINE)), kit.material(new MeshBasicMaterial({ color: colors.ink, side: BackSide })));
	const glass = new Mesh(
		outer,
		kit.material(
			new MeshPhysicalMaterial({ color: colors.glass, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.2, side: FrontSide, depthWrite: false }),
		),
	);
	prepass.renderOrder = 1;
	shell.renderOrder = 2;
	glass.renderOrder = 3;
	for (const m of [prepass, shell, glass]) {
		m.position.y = bowlY;
		group.add(m);
	}
	const rimMat = kit.std(colors.glass, 0.15);
	kit.add(group, new TorusGeometry(BOWL_R, BOWL_WALL, 8, 64), rimMat, [0, bowlY + BOWL_H, 0], { outline: 0, rot: [Math.PI / 2, 0, 0] });

	// Ground shadow, round so it reads the same at any heading.
	const shadow = new Mesh(
		kit.geometry(new CircleGeometry(1.55, 48).rotateX(-Math.PI / 2)),
		kit.material(new MeshBasicMaterial({ color: colors.ink, transparent: true, opacity: 0.18, depthWrite: false })),
	);
	shadow.position.y = 0.003;
	shadow.renderOrder = -1;

	const angleOf = (lift: number) => (clamp(lift, -max, max) / max) * (DIAL_SWEEP / 2);
	let current = { needle: 0, band: [0, 0] as [number, number], visitors: n };

	const setReading = (lift: number, low: number, high: number, mix: number) => {
		const a = angleOf(lift);
		const a0 = angleOf(low);
		const a1 = angleOf(high);
		needle.rotation.z = -a;
		writeArc(band, a0, a1, BAND_INNER * DIAL_R, BAND_OUTER * DIAL_R);
		const pad = BAND_EDGE / (BAND_OUTER * DIAL_R);
		writeArc(bandEdge, a0 - pad, a1 + pad, BAND_INNER * DIAL_R - BAND_EDGE, BAND_OUTER * DIAL_R + BAND_EDGE);
		bandMat.color.copy(rawColor).lerp(cupedColor, clamp(mix, 0, 1));
		current = { ...current, needle: a, band: [a0, a1] };
	};
	const setVisitors = (count: number) => {
		const v = clamp(Math.round(count), 0, n);
		balls.count = ballOutlines.count = v;
		current = { ...current, visitors: v };
	};
	const setPressed = (p: number) => {
		button.position.z = buttonRestZ - BUTTON_TRAVEL * clamp(p, 0, 1);
	};
	const last = readings.days[readings.days.length - 1];
	setReading(last.raw.lift, last.raw.low, last.raw.high, 0);

	// Keep the bowl's rim and the body's corners in view at any heading.
	const top = bowlY + BOWL_H + BOWL_WALL + SMALL_LINE;
	const bodyReach = Math.hypot(BODY_W_BOTTOM / 2 + BODY_LINE, BODY_D / 2 + BODY_LINE);
	const topReach = Math.max(BOWL_R, PAN_R) + SMALL_LINE;
	const shoulder = Math.hypot(BODY_W_TOP / 2 + BODY_LINE, BODY_D / 2 + BODY_LINE);
	const { targetY, halfHeight } = frameVertically(
		[
			[top, topReach],
			[top, -topReach],
			[BODY_TOP_Y + BODY_LINE, shoulder],
			[BODY_TOP_Y + BODY_LINE, -shoulder],
			[-BODY_LINE, bodyReach],
			[-BODY_LINE, -bodyReach],
		],
		Math.asin(viewDir.y),
	);

	return {
		group,
		balls,
		ballOutlines,
		shadow,
		framing: { target: new Vector3(0, targetY, 0), turnRadius: Math.max(bodyReach, topReach), halfHeight, viewDir },
		angleOf,
		setReading,
		setVisitors,
		setPressed,
		state: () => current,
		ballCenters,
		parts: kit.parts,
		dispose: kit.dispose,
	};
}
