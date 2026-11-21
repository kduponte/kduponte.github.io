/**
 * The Noise Problem's hero: a glass display cube on a plinth, holding one small sphere per
 * visitor of a seeded run of the page's own CUPED experiment (see stats-sim/cuped-cloud.ts).
 *
 * - Left to right: the visitor's pre-period value. Bottom to top: their post-period value, with a
 *   tick every 20 points on the front-left post. Back to front: the day they arrived (one layer per
 *   day). Color: control (A) or treatment (B).
 * - `setCollapse(t)` plays the CUPED adjustment: each sphere moves the fraction t of its own
 *   -theta * (x - xMean), so at t = 1 the tilted cloud has folded into a flat slab whose vertical
 *   spread is exactly sqrt(1 - r^2) of the raw spread.
 * - The orange bracket beside the right face spans the post-period mean +/- one standard deviation
 *   of whatever is drawn, so it shrinks by the same factor.
 *
 * Built with the shared kit (black inverted-hull outlines on the frame, plinth and bracket), in
 * scene units with the cube 2 units on a side. Pure: no renderer, no DOM, unit tested in Node.
 */
import {
	BackSide,
	CircleGeometry,
	Color,
	DoubleSide,
	DynamicDrawUsage,
	Group,
	InstancedMesh,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	PlaneGeometry,
	SphereGeometry,
	Vector3,
} from "three";
import { createPartKit, outlineGeometry, slab, OUTLINE } from "./kit";
import {
	postAxisPosition,
	postAxisTicks,
	varianceAt,
	writeCloudCoordinates,
	type CupedCloud,
} from "../stats-sim/cuped-cloud";

export interface CupedCubeColors {
	control: string;
	treatment: string;
	ink: string;
	frame: string;
	plinth: string;
	bracket: string;
	glass: string;
}

export const DEFAULT_CUPED_CUBE_COLORS: CupedCubeColors = {
	control: "#f6f1e4",
	treatment: "#2438ff",
	ink: "#111111",
	frame: "#f6f1e4",
	plinth: "#f6f1e4",
	bracket: "#ff5a1f",
	glass: "#eafff4",
};

/** Half the cube's side, to the frame rods' centerlines. */
export const CUBE_HALF = 1;
export const ROD = 0.06;
export const PLINTH_H = 0.26;
export const PLINTH_HALF = 1.16;
export const SPHERE_R = 0.03;
const SPHERE_LINE = 0.009;
const ROD_LINE = 0.022;
/** Clear space between the glass and the outermost sphere's surface. */
const GLASS_GAP = 0.035;
/** Half-extent of the plotted data, scene units: every sphere's surface stays inside the glass. */
export const DATA_HALF = CUBE_HALF - ROD / 2 - SPHERE_R - GLASS_GAP;
/** Height of the cube's center above the plinth's base. */
export const CUBE_CENTER_Y = PLINTH_H + ROD / 2 + CUBE_HALF;

/** The direction the camera looks from, and the shared viewer's field of view and margin (viewer.ts). */
export const VIEW_DIR = new Vector3(0, 0.2, 1).normalize();
const VIEWER_HALF_FOV = (14 * Math.PI) / 180;
const VIEWER_MARGIN = 1.12;

const TICK_LEN = 0.085;
const TICK_W = 0.016;
const BRACKET_X = CUBE_HALF + ROD / 2 + 0.11;
const BRACKET_W = 0.05;
const BRACKET_CAP = 0.15;

/** A point to keep in frame: its height, and its horizontal distance away from the camera (negative = nearer). */
type Extreme = [y: number, away: number];

/**
 * A target on the spin axis and a half-height for the viewer so every extreme fits vertically in
 * perspective, seen from `elevation` above the horizon. The viewer only fits a flat half-height, so
 * near-low corners (which look lower) and far-high ones (which look higher) need this correction.
 * The same method as frameVertically in buoy-diorama.ts, kept local so this bundle doesn't pull in
 * the ocean code.
 */
function frameVertically(extremes: Extreme[], elevation: number): { targetY: number; halfHeight: number } {
	const c = Math.cos(elevation);
	const s = Math.sin(elevation);
	let ty = 0;
	let half = 1;
	for (let i = 0; i < 16; i++) {
		const dist = (half / Math.tan(VIEWER_HALF_FOV)) * VIEWER_MARGIN;
		const ups = extremes.map(([y, away]) => {
			const up = (y - ty) * c + away * s;
			const depth = away * c - (y - ty) * s;
			return (up * dist) / (dist + depth);
		});
		const top = Math.max(...ups);
		const bottom = Math.min(...ups);
		ty += (top + bottom) / 2 / c;
		half = Math.max((top - bottom) / 2, 1e-3);
	}
	return { targetY: ty, halfHeight: half * Math.cos(VIEWER_HALF_FOV) };
}

export interface CupedCubeModel {
	/** Origin at the center of the plinth's base. */
	group: Group;
	spheres: InstancedMesh;
	sphereOutlines: InstancedMesh;
	/** A soft round ground shadow, meant to sit outside whatever spins the model. */
	shadow: Mesh;
	/** Where the camera should aim from VIEW_DIR, and how much room the model needs at any heading. */
	framing: { target: Vector3; turnRadius: number; halfHeight: number; viewDir: Vector3 };
	/** Current adjustment, 0 (raw) to 1 (CUPED). */
	readonly collapse: number;
	setCollapse(t: number): void;
	/** The bracket's current center and half-length, scene units (for tests and readouts). */
	bracket(): { centerY: number; halfLength: number };
	parts: Mesh[];
	dispose(): void;
}

export function buildCupedCube(cloud: CupedCloud, colors: CupedCubeColors = DEFAULT_CUPED_CUBE_COLORS): CupedCubeModel {
	const kit = createPartKit(colors.ink);
	const group = new Group();
	const cy = CUBE_CENTER_Y;
	const n = cloud.visitors.length;

	// Plinth, outlined like every other big part.
	const plinthMat = kit.std(colors.plinth, 0.55);
	kit.add(group, slab(PLINTH_HALF * 2, PLINTH_H, PLINTH_HALF * 2, 0.05, 0.03), plinthMat, [0, PLINTH_H / 2, 0], { outline: OUTLINE });

	// Frame: twelve rods on the cube's edges, each with its own black shell.
	const frameMat = kit.std(colors.frame, 0.4);
	const span = CUBE_HALF * 2 + ROD;
	for (const a of [-1, 1]) {
		for (const b of [-1, 1]) {
			kit.add(group, slab(span, ROD, ROD, 0.012, 0.008), frameMat, [0, cy + a * CUBE_HALF, b * CUBE_HALF], { outline: ROD_LINE });
			kit.add(group, slab(ROD, span, ROD, 0.012, 0.008), frameMat, [a * CUBE_HALF, cy, b * CUBE_HALF], { outline: ROD_LINE });
			kit.add(group, slab(ROD, ROD, span, 0.012, 0.008), frameMat, [a * CUBE_HALF, cy + b * CUBE_HALF, 0], { outline: ROD_LINE });
		}
	}

	// Glass: five panes (the plinth is the floor), clear with a faint tint and studio reflections.
	// Drawn after the spheres and without writing depth, so every sphere shows through.
	const glassMat = kit.material(
		new MeshPhysicalMaterial({
			color: colors.glass,
			roughness: 0.04,
			metalness: 0,
			clearcoat: 1,
			clearcoatRoughness: 0.04,
			transparent: true,
			opacity: 0.14,
			side: DoubleSide,
			depthWrite: false,
		}),
	);
	const pane = (rot: [number, number, number], pos: [number, number, number]) => {
		const m = kit.add(group, new PlaneGeometry(CUBE_HALF * 2, CUBE_HALF * 2), glassMat, pos, { outline: 0, rot });
		m.renderOrder = 2;
	};
	pane([0, 0, 0], [0, cy, CUBE_HALF]);
	pane([0, Math.PI, 0], [0, cy, -CUBE_HALF]);
	pane([0, Math.PI / 2, 0], [CUBE_HALF, cy, 0]);
	pane([0, -Math.PI / 2, 0], [-CUBE_HALF, cy, 0]);
	pane([-Math.PI / 2, 0, 0], [0, cy + CUBE_HALF, 0]);

	// Axis ticks, black like the outlines. Post-period: every 20 points, out of the front-left post.
	const inkMat = kit.std(colors.ink, 0.6);
	const tickX = -CUBE_HALF - ROD / 2 - TICK_LEN / 2 + 0.01;
	for (const v of postAxisTicks(cloud)) {
		kit.add(group, slab(TICK_LEN, TICK_W, TICK_W, 0.004, 0.002), inkMat, [tickX, cy + DATA_HALF * postAxisPosition(cloud, v), CUBE_HALF], { outline: 0 });
	}
	// Pre-period: every standard deviation, forward out of the front-bottom rail.
	const tickZ = CUBE_HALF + ROD / 2 + TICK_LEN / 2 - 0.01;
	const h = cloud.halfRangeSd;
	for (let k = Math.ceil(-h); k <= Math.floor(h); k++) {
		kit.add(group, slab(TICK_W, TICK_W, TICK_LEN, 0.004, 0.002), inkMat, [DATA_HALF * (k / h), cy - CUBE_HALF, tickZ], { outline: 0 });
	}

	// Mean +/- 1 SD bracket beside the right face, at the front edge: a bar and two caps, each in
	// its own group so it can be stretched or moved without rebuilding.
	const bracketMat = kit.std(colors.bracket, 0.45);
	const bar = new Group();
	const capTop = new Group();
	const capBottom = new Group();
	kit.add(bar, slab(BRACKET_W, 1, BRACKET_W, 0.006, 0.004), bracketMat, [0, 0, 0], { outline: ROD_LINE });
	for (const cap of [capTop, capBottom]) kit.add(cap, slab(BRACKET_CAP, BRACKET_W, BRACKET_W, 0.012, 0.008), bracketMat, [0, 0, 0], { outline: ROD_LINE });
	for (const g of [bar, capTop, capBottom]) {
		g.position.set(BRACKET_X, cy, CUBE_HALF);
		group.add(g);
	}

	// Spheres: one instance per visitor, colored by arm, with an instanced black shell that shares
	// the spheres' matrices.
	const sphereGeo = kit.geometry(new SphereGeometry(SPHERE_R, 12, 8));
	const shellGeo = kit.geometry(outlineGeometry(sphereGeo, SPHERE_LINE));
	const sphereMat = kit.std("#ffffff", 0.38);
	const shellMat = kit.material(new MeshBasicMaterial({ color: colors.ink, side: BackSide }));
	const spheres = new InstancedMesh(sphereGeo, sphereMat, n);
	const sphereOutlines = new InstancedMesh(shellGeo, shellMat, n);
	spheres.instanceMatrix.setUsage(DynamicDrawUsage);
	sphereOutlines.instanceMatrix = spheres.instanceMatrix;
	const control = new Color(colors.control);
	const treatment = new Color(colors.treatment);
	cloud.visitors.forEach((v, i) => spheres.setColorAt(i, v.arm === "A" ? control : treatment));
	// Instances move every frame of the adjustment; skip the per-instance bounds and never cull.
	spheres.frustumCulled = sphereOutlines.frustumCulled = false;
	group.add(spheres, sphereOutlines);

	// Ground shadow, flat and round so it reads the same at any heading.
	const shadowGeo = kit.geometry(new CircleGeometry(PLINTH_HALF * 1.32, 48));
	shadowGeo.rotateX(-Math.PI / 2);
	const shadowMat = kit.material(new MeshBasicMaterial({ color: colors.ink, transparent: true, opacity: 0.18, depthWrite: false }));
	const shadowMesh = new Mesh(shadowGeo, shadowMat);
	shadowMesh.position.y = 0.003;
	shadowMesh.renderOrder = -1;

	const coords = new Float32Array(n * 3);
	// Every instance matrix starts as the identity (InstancedMesh's default); only the translation
	// column is rewritten as the cloud moves.
	const matrices = spheres.instanceMatrix.array as Float32Array;
	let collapse = 0;
	let bracketState = { centerY: cy, halfLength: 0 };

	const setCollapse = (t: number) => {
		collapse = Math.max(0, Math.min(1, t));
		writeCloudCoordinates(cloud, collapse, coords);
		for (let i = 0; i < n; i++) {
			matrices[i * 16 + 12] = DATA_HALF * coords[i * 3];
			matrices[i * 16 + 13] = cy + DATA_HALF * coords[i * 3 + 1];
			matrices[i * 16 + 14] = DATA_HALF * coords[i * 3 + 2];
		}
		spheres.instanceMatrix.needsUpdate = true;

		const sd = Math.sqrt(varianceAt(cloud, collapse));
		const centerY = cy + DATA_HALF * postAxisPosition(cloud, cloud.yMean);
		const halfLength = (DATA_HALF * sd) / cloud.config.y_sd / cloud.halfRangeSd;
		bar.position.y = centerY;
		bar.scale.y = halfLength * 2;
		capTop.position.y = centerY + halfLength;
		capBottom.position.y = centerY - halfLength;
		bracketState = { centerY, halfLength };
	};
	setCollapse(0);

	// Keep the frame's top corners and the plinth's bottom corners in view at any heading.
	const top = cy + CUBE_HALF + ROD / 2 + ROD_LINE;
	const topReach = Math.SQRT2 * (CUBE_HALF + ROD / 2 + ROD_LINE);
	const turnRadius = Math.hypot(PLINTH_HALF + OUTLINE, PLINTH_HALF + OUTLINE);
	const { targetY, halfHeight } = frameVertically(
		[
			[top, topReach],
			[top, -topReach],
			[-OUTLINE, turnRadius],
			[-OUTLINE, -turnRadius],
		],
		Math.asin(VIEW_DIR.y),
	);
	return {
		group,
		spheres,
		sphereOutlines,
		shadow: shadowMesh,
		framing: { target: new Vector3(0, targetY, 0), turnRadius, halfHeight, viewDir: VIEW_DIR.clone() },
		get collapse() {
			return collapse;
		},
		setCollapse,
		bracket: () => bracketState,
		parts: kit.parts,
		dispose: kit.dispose,
	};
}
