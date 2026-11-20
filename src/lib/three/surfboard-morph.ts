/**
 * Surfboards and a Play-Doh blob on one shared vertex grid, so any board can melt into the blob
 * and back with a per-vertex blend.
 *
 * The grid is STATIONS cross-sections from nose (s = 0) to tail (s = 1), each a ring of RING
 * points (plus one seam duplicate for texture coordinates). Ring point j sits at angle
 * phi = 2*pi*j/RING: t = cos(phi) runs across the board (+1 is the right rail, -1 the left), and
 * sin(phi) >= 0 is the deck, < 0 the bottom. For the blob the same (s, phi) are polar angles on an
 * ellipsoid, so nose and tail become its poles.
 *
 * Boards are built in meters from real length, width and thickness. The planshape (wide point,
 * nose and tail widths 12" from the ends), tail shape, sting step, rocker, foil and rail shape
 * are estimated parameters; one remaining "fullness" knob scales the cross-section exponents and
 * is calibrated so the mesh volume equals the board's liters exactly. Pure: no renderer, no DOM.
 */

export const INCH = 0.0254;
export const STATIONS = 120;
export const RING = 48;
/** Vertices per ring, including the seam duplicate of ring point 0. */
export const RING_STRIDE = RING + 1;
export const VERTEX_COUNT = STATIONS * RING_STRIDE;

export type TailKind = "square" | "squash" | "round" | "pin" | "swallow";

/** A board's real dimensions plus its estimated shape, all in inches. */
export interface BoardShape {
	lengthIn: number;
	widthIn: number;
	thicknessIn: number;
	/** Wide point, inches forward (+) or back (-) of center. */
	widePointFromCenterIn: number;
	/** Outline width 12" back from the nose tip, and 12" up from the tail. */
	noseWidth12In: number;
	tailWidth12In: number;
	/** Nose roundness: 1 is pointed, 2 is an elliptical round nose. */
	noseTip: number;
	tail: {
		kind: TailKind;
		/** Outline width at the very tail (0 for a pin; tip to tip for a swallow). */
		endWidthIn: number;
		/** Swallow notch depth. */
		depthIn?: number;
		/** How far a squash tail's corners round off toward the nose. */
		cornerIn?: number;
		/** Pin tail roundness, like noseTip. */
		pinRoundness?: number;
	};
	/** A stinger: the outline steps in by widthDropFrac this far up from the tail. */
	sting?: { fromTailIn: number; widthDropFrac: number; rampIn: number };
	rocker: { noseIn: number; tailIn: number };
	/** Thickness 12" from each end as a fraction of the maximum, and where the maximum sits. */
	foil: { noseFrac12: number; tailFrac12: number; thickestFromCenterIn: number };
	/** Rail apex height as a fraction of thickness, and superellipse exponents of deck and bottom. */
	rail: { apexFrac: number; deckExp: number; bottomExp: number };
}

export interface Topology {
	/** Station parameter, 0 at the nose tip to 1 at the tail. */
	s: Float32Array;
	/** Across-board coordinate of each ring point, -1..1. */
	t: Float32Array;
	/** 1 where the ring point is on the deck (or a rail apex), 0 on the bottom. */
	deck: Uint8Array;
	/** sin(phi) of each ring point. */
	sinPhi: Float32Array;
	index: Uint32Array;
	/**
	 * u runs nose (0) to tail (1). v maps the deck to 0..0.5 (right rail to left rail) and the
	 * bottom to 0.5..1 (left rail back to the right rail), linear in t: see deckV / bottomV.
	 */
	uv: Float32Array;
}

/** Texture v for a deck point at across-board t (use with flipY = false). */
export const deckV = (t: number) => (1 - t) / 4;
/** Texture v for a bottom point at across-board t. */
export const bottomV = (t: number) => 0.5 + (1 + t) / 4;

let cachedTopology: Topology | null = null;

/** The shared grid. Stations cluster toward nose and tail, where the outline curves fastest. */
export function createTopology(): Topology {
	if (cachedTopology) return cachedTopology;
	const s = new Float32Array(STATIONS);
	for (let i = 0; i < STATIONS; i++) {
		const lin = i / (STATIONS - 1);
		s[i] = 0.5 * lin + 0.25 * (1 - Math.cos(Math.PI * lin));
	}
	const t = new Float32Array(RING_STRIDE);
	const sinPhi = new Float32Array(RING_STRIDE);
	const deck = new Uint8Array(RING_STRIDE);
	for (let j = 0; j < RING_STRIDE; j++) {
		const phi = (2 * Math.PI * (j % RING)) / RING;
		t[j] = Math.cos(phi);
		sinPhi[j] = Math.sin(phi);
		deck[j] = j <= RING / 2 ? 1 : 0;
	}
	// Exact rail apexes, so deck and bottom formulas agree there.
	t[0] = t[RING] = 1;
	t[RING / 2] = -1;
	sinPhi[0] = sinPhi[RING / 2] = sinPhi[RING] = 0;

	const uv = new Float32Array(VERTEX_COUNT * 2);
	for (let i = 0; i < STATIONS; i++) {
		for (let j = 0; j < RING_STRIDE; j++) {
			const k = (i * RING_STRIDE + j) * 2;
			uv[k] = s[i];
			uv[k + 1] = j === RING ? 1 : deck[j] ? deckV(t[j]) : bottomV(t[j]);
		}
	}

	const index = new Uint32Array((STATIONS - 1) * RING * 6);
	let n = 0;
	for (let i = 0; i < STATIONS - 1; i++) {
		for (let j = 0; j < RING; j++) {
			const a = i * RING_STRIDE + j;
			const b = a + RING_STRIDE;
			const c = b + 1;
			const d = a + 1;
			// Wound so face normals point outward (cross(d - a, b - a) faces out).
			index[n++] = a;
			index[n++] = d;
			index[n++] = b;
			index[n++] = d;
			index[n++] = c;
			index[n++] = b;
		}
	}
	cachedTopology = { s, t, deck, sinPhi, index, uv };
	return cachedTopology;
}

// ---------------------------------------------------------------------------------------------
// Board outline, foil and rocker (inches; x = 0 at mid-length, nose toward +x)
// ---------------------------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (v: number) => {
	const c = clamp01(v);
	return c * c * (3 - 2 * c);
};
/** Superellipse quarter: 1 at a = 0, 0 at a = 1. Exponent 2 is a circle; larger is boxier. */
const superellipse = (a: number, e: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(a)), e)), 1 / e);

/** Exponent p so that (1 - u^p) equals `target` at u = u0 (both in (0, 1)). */
function solveExponent(u0: number, target: number): number {
	const u = Math.min(Math.max(u0, 1e-6), 1 - 1e-6);
	const g = Math.min(Math.max(target, 1e-6), 1 - 1e-6);
	return Math.log(1 - g) / Math.log(u);
}

/** Everything about a board shape that doesn't change per vertex, precomputed. */
export interface PreparedBoard {
	shape: BoardShape;
	halfL: number;
	halfW: number;
	xw: number;
	pN: number;
	qN: number;
	endHalf: number;
	pT: number;
	qT: number;
	xStep: number | null;
	stepDrop: number;
	stepRamp: number;
	xT: number;
	aN: number;
	aT: number;
	xFlat: number;
	tailRamp: number;
	edgeIn: number;
}

export function prepareBoard(shape: BoardShape): PreparedBoard {
	const halfL = shape.lengthIn / 2;
	const halfW = shape.widthIn / 2;
	const xw = shape.widePointFromCenterIn;

	// Nose: hw = H (1 - u^pN)^(1/qN), with the published-style "width 12 inches back" pinned.
	const qN = shape.noseTip;
	const uN = (halfL - 12 - xw) / (halfL - xw);
	const pN = solveExponent(uN, Math.pow(shape.noseWidth12In / 2 / halfW, qN));

	// Tail: hw = E + (H - E)(1 - u^pT)^(1/qT). A sting narrows everything behind its step.
	const kind = shape.tail.kind;
	const endHalf = kind === "pin" ? 0 : shape.tail.endWidthIn / 2;
	const qT = kind === "pin" ? (shape.tail.pinRoundness ?? 1.35) : kind === "round" ? 1.6 : 1;
	const sting = shape.sting;
	const stepDrop = sting?.widthDropFrac ?? 0;
	const xStep = sting ? -halfL + sting.fromTailIn : null;
	const tail12 = shape.tailWidth12In / 2 / (sting && sting.fromTailIn > 12 ? 1 - stepDrop : 1);
	const uT = (xw - (-halfL + 12)) / (xw + halfL);
	const pT = solveExponent(uT, Math.pow((tail12 - endHalf) / (halfW - endHalf), qT));

	// Foil: th = T * sqrt(1 - u^a) either side of the thickest point.
	const xT = shape.foil.thickestFromCenterIn;
	const aN = solveExponent((halfL - 12 - xT) / (halfL - xT), shape.foil.noseFrac12 ** 2);
	const aT = solveExponent((xT - (-halfL + 12)) / (xT + halfL), shape.foil.tailFrac12 ** 2);

	const depth = shape.tail.depthIn ?? 0;
	const corner = shape.tail.cornerIn ?? 0;
	const tailRamp = kind === "swallow" ? Math.max(6, depth * 2.5) : kind === "squash" ? Math.max(4, corner * 2.5) : 1;

	return {
		shape,
		halfL,
		halfW,
		xw,
		pN,
		qN,
		endHalf,
		pT,
		qT,
		xStep,
		stepDrop,
		stepRamp: sting?.rampIn ?? 1,
		xT,
		aN,
		aT,
		xFlat: -0.08 * shape.lengthIn,
		tailRamp,
		edgeIn: 0.6,
	};
}

/** Outline half-width (inches) at plan position x (inches from mid-length, nose +). */
export function halfWidthIn(p: PreparedBoard, x: number): number {
	let hw: number;
	if (x >= p.xw) {
		const u = clamp01((x - p.xw) / (p.halfL - p.xw));
		hw = p.halfW * superellipseLike(u, p.pN, p.qN);
	} else {
		const u = clamp01((p.xw - x) / (p.xw + p.halfL));
		hw = p.endHalf + (p.halfW - p.endHalf) * superellipseLike(u, p.pT, p.qT);
	}
	if (p.xStep !== null && x < p.xStep) hw *= 1 - p.stepDrop * smoothstep((p.xStep - x) / p.stepRamp);
	return hw;
}

/** (1 - u^p)^(1/q), the outline curve on either side of the wide point. */
function superellipseLike(u: number, p: number, q: number): number {
	return Math.pow(Math.max(0, 1 - Math.pow(u, p)), 1 / q);
}

/** Foil: thickness (inches) at plan position x, before the tail edge closes. */
export function thicknessIn(p: PreparedBoard, x: number): number {
	const T = p.shape.thicknessIn;
	if (x >= p.xT) return T * Math.sqrt(Math.max(0, 1 - Math.pow(clamp01((x - p.xT) / (p.halfL - p.xT)), p.aN)));
	return T * Math.sqrt(Math.max(0, 1 - Math.pow(clamp01((p.xT - x) / (p.xT + p.halfL)), p.aT)));
}

/** Rocker: how far the bottom lifts (inches) above the flat spot at plan position x. */
export function rockerIn(p: PreparedBoard, x: number): number {
	const { noseIn, tailIn } = p.shape.rocker;
	if (x >= p.xFlat) return noseIn * Math.pow(clamp01((x - p.xFlat) / (p.halfL - p.xFlat)), 2.6);
	return tailIn * Math.pow(clamp01((p.xFlat - x) / (p.xFlat + p.halfL)), 2.2);
}

/** Station plan position (inches) for station parameter s, ignoring the tail warp. */
export const stationX = (p: PreparedBoard, s: number) => p.halfL - s * p.shape.lengthIn;

/** How far (inches, toward the nose) a tail point at across-board t is pulled from station x. */
function tailWarpIn(p: PreparedBoard, x: number, t: number): number {
	const kind = p.shape.tail.kind;
	if (kind !== "swallow" && kind !== "squash") return 0;
	const g = smoothstep((-p.halfL + p.tailRamp - x) / p.tailRamp);
	if (g <= 0) return 0;
	const a = Math.abs(t);
	if (kind === "swallow") return g * (p.shape.tail.depthIn ?? 0) * Math.pow(1 - a, 1.15);
	return g * (p.shape.tail.cornerIn ?? 0) * Math.pow(a, 4);
}

/** Closes the tail edge: 1 everywhere except the last fraction of an inch, where it falls to 0. */
function edgeClose(p: PreparedBoard, x: number): number {
	const d = x + p.halfL; // inches from the tail end
	if (d >= p.edgeIn) return 1;
	const u = 1 - Math.max(0, d) / p.edgeIn;
	return Math.sqrt(Math.max(0, 1 - u * u));
}

/** A board point in inches: plan x and z, height y. `side` 1 is deck, -1 bottom. */
export function boardPointIn(p: PreparedBoard, fullness: number, s: number, t: number, side: 1 | -1): [number, number, number] {
	const xs = stationX(p, s);
	const hw = halfWidthIn(p, xs);
	const x = xs + tailWarpIn(p, xs, t);
	const th = thicknessIn(p, x) * edgeClose(p, xs);
	const apex = p.shape.rail.apexFrac;
	const hBot = apex * th;
	const hTop = th - hBot;
	const base = rockerIn(p, x) + hBot;
	const y =
		side === 1
			? base + hTop * superellipse(t, p.shape.rail.deckExp * fullness)
			: base - hBot * superellipse(t, p.shape.rail.bottomExp * fullness);
	return [x, y, t * hw];
}

/**
 * Everything about a board's grid that doesn't depend on rail fullness, per vertex and in meters:
 * plan x and z, the rail apex height, and how far deck and bottom bulge from it at the stringer.
 * Calibration then only re-evaluates one superellipse per ring point per try.
 */
interface BoardGrid {
	x: Float32Array;
	z: Float32Array;
	apexY: Float32Array;
	hTop: Float32Array;
	hBot: Float32Array;
}
const gridCache = new WeakMap<PreparedBoard, BoardGrid>();

function boardGrid(p: PreparedBoard): BoardGrid {
	const cached = gridCache.get(p);
	if (cached) return cached;
	const topo = createTopology();
	const g: BoardGrid = {
		x: new Float32Array(VERTEX_COUNT),
		z: new Float32Array(VERTEX_COUNT),
		apexY: new Float32Array(VERTEX_COUNT),
		hTop: new Float32Array(VERTEX_COUNT),
		hBot: new Float32Array(VERTEX_COUNT),
	};
	const apex = p.shape.rail.apexFrac;
	for (let i = 0; i < STATIONS; i++) {
		const xs = stationX(p, topo.s[i]);
		const hw = halfWidthIn(p, xs);
		const close = edgeClose(p, xs);
		for (let j = 0; j < RING_STRIDE; j++) {
			const t = topo.t[j];
			const x = xs + tailWarpIn(p, xs, t);
			const th = thicknessIn(p, x) * close;
			const k = i * RING_STRIDE + j;
			g.x[k] = x * INCH;
			g.z[k] = t * hw * INCH;
			g.hBot[k] = apex * th * INCH;
			g.hTop[k] = (1 - apex) * th * INCH;
			g.apexY[k] = (rockerIn(p, x) + apex * th) * INCH;
		}
	}
	gridCache.set(p, g);
	return g;
}

/** Fill `out` with board vertex positions in meters for a given rail fullness. */
export function writeBoardPositions(p: PreparedBoard, fullness: number, out: Float32Array): Float32Array {
	const topo = createTopology();
	const g = boardGrid(p);
	const deckE = p.shape.rail.deckExp * fullness;
	const bottomE = p.shape.rail.bottomExp * fullness;
	const bulge = new Float64Array(RING_STRIDE);
	for (let j = 0; j < RING_STRIDE; j++) bulge[j] = topo.deck[j] ? superellipse(topo.t[j], deckE) : -superellipse(topo.t[j], bottomE);
	for (let i = 0; i < STATIONS; i++) {
		for (let j = 0; j < RING_STRIDE; j++) {
			const k = i * RING_STRIDE + j;
			const b = bulge[j];
			out[k * 3] = g.x[k];
			out[k * 3 + 1] = g.apexY[k] + (b >= 0 ? g.hTop[k] : g.hBot[k]) * b;
			out[k * 3 + 2] = g.z[k];
		}
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------------------------

/** Enclosed volume (cubic scene units) of a closed, outward-wound triangle mesh. */
export function meshVolume(positions: ArrayLike<number>, index: ArrayLike<number>): number {
	let v = 0;
	for (let n = 0; n < index.length; n += 3) {
		const a = index[n] * 3;
		const b = index[n + 1] * 3;
		const c = index[n + 2] * 3;
		const ax = positions[a];
		const ay = positions[a + 1];
		const az = positions[a + 2];
		const bx = positions[b];
		const by = positions[b + 1];
		const bz = positions[b + 2];
		const cx = positions[c];
		const cy = positions[c + 1];
		const cz = positions[c + 2];
		v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
	}
	return v / 6;
}

/** Liters enclosed by positions in meters on the shared grid. */
export const litersOf = (positions: ArrayLike<number>) => meshVolume(positions, createTopology().index) * 1000;

/** Scale positions about `pivot` so the mesh encloses exactly `liters`. Returns the factor used. */
export function scaleToLiters(positions: Float32Array, liters: number, pivot: [number, number, number]): number {
	const current = litersOf(positions);
	if (!(current > 0) || !(liters > 0)) return 1;
	const f = Math.cbrt(liters / current);
	const [px, py, pz] = pivot;
	for (let k = 0; k < positions.length; k += 3) {
		positions[k] = px + (positions[k] - px) * f;
		positions[k + 1] = py + (positions[k + 1] - py) * f;
		positions[k + 2] = pz + (positions[k + 2] - pz) * f;
	}
	return f;
}

export interface CalibratedBoard {
	prepared: PreparedBoard;
	liters: number;
	/** Rail fullness factor that makes the mesh hold exactly `liters`. */
	fullness: number;
	positions: Float32Array;
}

const FULLNESS_MIN = 0.25;
const FULLNESS_MAX = 12;

/**
 * Build a board whose mesh volume matches `liters`, by bisecting the one free shape knob (rail
 * fullness). Throws if the estimated outline and foil can't reach the target at any fullness,
 * which means the estimated shape is wrong for the published numbers.
 */
export function calibrateBoard(shape: BoardShape, liters: number): CalibratedBoard {
	const prepared = prepareBoard(shape);
	const positions = new Float32Array(VERTEX_COUNT * 3);
	const volumeAt = (f: number) => litersOf(writeBoardPositions(prepared, f, positions));
	let lo = Math.log(FULLNESS_MIN);
	let hi = Math.log(FULLNESS_MAX);
	if (volumeAt(Math.exp(lo)) > liters || volumeAt(Math.exp(hi)) < liters) {
		throw new Error(`Board shape cannot hold ${liters} L at any rail fullness`);
	}
	for (let n = 0; n < 32; n++) {
		const mid = (lo + hi) / 2;
		if (volumeAt(Math.exp(mid)) < liters) lo = mid;
		else hi = mid;
	}
	const fullness = Math.exp((lo + hi) / 2);
	writeBoardPositions(prepared, fullness, positions);
	return { prepared, liters, fullness, positions };
}

/** A point on the board's bottom (meters) at plan x and z in inches, for mounting fins. */
export function bottomPoint(board: CalibratedBoard, xIn: number, zIn: number): [number, number, number] {
	const p = board.prepared;
	const s = clamp01((p.halfL - xIn) / p.shape.lengthIn);
	const hw = halfWidthIn(p, stationX(p, s));
	const t = hw > 0 ? Math.max(-1, Math.min(1, zIn / hw)) : 0;
	const [x, y, z] = boardPointIn(p, board.fullness, s, t, -1);
	return [x * INCH, y * INCH, z * INCH];
}

// ---------------------------------------------------------------------------------------------
// The blob
// ---------------------------------------------------------------------------------------------

/** Unit vectors, frequencies and phases for a cheap, smooth, deterministic surface wobble. */
const WOBBLE_TERMS = [
	{ d: [0.62, 0.55, 0.56], f: 2.1, w: 1.7, ph: 0.3, a: 1 },
	{ d: [-0.71, 0.21, 0.67], f: 2.9, w: -2.3, ph: 1.9, a: 0.7 },
	{ d: [0.11, -0.93, 0.35], f: 3.7, w: 2.9, ph: 4.1, a: 0.5 },
	{ d: [0.88, 0.12, -0.46], f: 1.6, w: -1.3, ph: 2.6, a: 0.8 },
	{ d: [-0.27, 0.66, -0.7], f: 4.4, w: 3.6, ph: 5.3, a: 0.35 },
];
const WOBBLE_NORM = 1 / WOBBLE_TERMS.reduce((sum, k) => sum + k.a, 0);

/** Smooth noise in [-1, 1] over directions on the unit sphere, drifting with time. */
export function wobble(dx: number, dy: number, dz: number, time: number): number {
	let v = 0;
	for (const k of WOBBLE_TERMS) v += k.a * Math.sin(k.f * (dx * k.d[0] + dy * k.d[1] + dz * k.d[2]) + k.w * time + k.ph);
	return v * WOBBLE_NORM;
}

export interface BlobOptions {
	liters: number;
	/** Seconds, drives the wobble. */
	time?: number;
	/** Wobble amplitude as a fraction of the radius. */
	wobble?: number;
	/** Vertical squash (< 1) or stretch (> 1); the other axes compensate to keep volume. */
	squash?: number;
	/** Where the blob's bottom center sits, meters. */
	offset?: [number, number, number];
}

/** Proportions of the resting blob: a little longer than wide, flatter underneath. */
const BLOB_RX = 1.18;
const BLOB_RY = 0.82;
const BLOB_RZ = 1;
const BLOB_FLAT_BOTTOM = 0.62;

/**
 * Fill `out` with blob positions (meters) holding exactly `liters`. The blob is an ellipsoid on
 * the shared grid, wobbled by low-frequency noise, squashed about its bottom, then scaled so its
 * mesh volume matches; its bottom center sits at `offset`.
 */
export function writeBlobPositions(out: Float32Array, opts: BlobOptions): Float32Array {
	const topo = createTopology();
	const { liters, time = 0, wobble: amp = 0, squash = 1, offset = [0, 0, 0] } = opts;
	const sy = squash;
	const sxz = 1 / Math.sqrt(sy);
	let minY = Infinity;
	for (let i = 0; i < STATIONS; i++) {
		const theta = Math.PI * topo.s[i];
		const ct = Math.cos(theta);
		const st = Math.sin(theta);
		for (let j = 0; j < RING_STRIDE; j++) {
			const sp = topo.sinPhi[j];
			const dx = ct;
			const dy = st * sp;
			const dz = st * topo.t[j];
			const r = 1 + amp * wobble(dx, dy, dz, time);
			const k = (i * RING_STRIDE + j) * 3;
			out[k] = dx * BLOB_RX * r * sxz;
			out[k + 1] = dy * BLOB_RY * (dy < 0 ? BLOB_FLAT_BOTTOM : 1) * r * sy;
			out[k + 2] = dz * BLOB_RZ * r * sxz;
			if (out[k + 1] < minY) minY = out[k + 1];
		}
	}
	// Sit on the bottom, size to the liters, then move into place.
	for (let k = 1; k < out.length; k += 3) out[k] -= minY;
	scaleToLiters(out, liters, [0, 0, 0]);
	const [ox, oy, oz] = offset;
	for (let k = 0; k < out.length; k += 3) {
		out[k] += ox;
		out[k + 1] += oy;
		out[k + 2] += oz;
	}
	return out;
}

/** out = a + (b - a) * w. w may overshoot past 1 for a jelly wobble. */
export function blendPositions(a: Float32Array, b: Float32Array, w: number, out: Float32Array): Float32Array {
	for (let k = 0; k < out.length; k++) out[k] = a[k] + (b[k] - a[k]) * w;
	return out;
}

// ---------------------------------------------------------------------------------------------
// Normals and the outline shell
// ---------------------------------------------------------------------------------------------

/**
 * Smooth vertex normals for the grid, treating the texture seam as one vertex so shading and
 * the outline shell stay continuous. Points that coincide at the nose and tail (poles, or a
 * square or swallow tail's knife edge) share an averaged normal, so the shell never cracks.
 */
export function writeGridNormals(positions: Float32Array, out: Float32Array): Float32Array {
	const acc = new Float64Array(STATIONS * RING * 3);
	const P = (i: number, j: number) => (i * RING_STRIDE + j) * 3;
	const A = (i: number, j: number) => (i * RING + (j % RING)) * 3;
	const add = (i: number, j: number, nx: number, ny: number, nz: number) => {
		const k = A(i, j);
		acc[k] += nx;
		acc[k + 1] += ny;
		acc[k + 2] += nz;
	};
	const tri = (i0: number, j0: number, i1: number, j1: number, i2: number, j2: number) => {
		const a = P(i0, j0);
		const b = P(i1, j1);
		const c = P(i2, j2);
		const ux = positions[b] - positions[a];
		const uy = positions[b + 1] - positions[a + 1];
		const uz = positions[b + 2] - positions[a + 2];
		const vx = positions[c] - positions[a];
		const vy = positions[c + 1] - positions[a + 1];
		const vz = positions[c + 2] - positions[a + 2];
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
		add(i0, j0, nx, ny, nz);
		add(i1, j1, nx, ny, nz);
		add(i2, j2, nx, ny, nz);
	};
	for (let i = 0; i < STATIONS - 1; i++) {
		for (let j = 0; j < RING; j++) {
			// Same winding as the index: (a, d, b) and (d, c, b).
			tri(i, j, i, j + 1, i + 1, j);
			tri(i, j + 1, i + 1, j + 1, i + 1, j);
		}
	}

	const average = (i: number, js: number[]) => {
		let x = 0;
		let y = 0;
		let z = 0;
		for (const j of js) {
			const k = A(i, j);
			x += acc[k];
			y += acc[k + 1];
			z += acc[k + 2];
		}
		for (const j of js) {
			const k = A(i, j);
			acc[k] = x;
			acc[k + 1] = y;
			acc[k + 2] = z;
		}
	};
	const allRing = Array.from({ length: RING }, (_, j) => j);
	average(0, allRing); // the nose is always a single point
	const last = STATIONS - 1;
	let spread = 0;
	const p0 = P(last, 0);
	for (let j = 1; j < RING; j++) {
		const k = P(last, j);
		spread = Math.max(spread, Math.abs(positions[k] - positions[p0]) + Math.abs(positions[k + 1] - positions[p0 + 1]) + Math.abs(positions[k + 2] - positions[p0 + 2]));
	}
	if (spread < 1e-6) average(last, allRing);
	else for (let j = 1; j < RING / 2; j++) average(last, [j, RING - j]); // deck and bottom meet

	for (let i = 0; i < STATIONS; i++) {
		for (let j = 0; j < RING_STRIDE; j++) {
			const a = A(i, j);
			const len = Math.hypot(acc[a], acc[a + 1], acc[a + 2]) || 1;
			const k = P(i, j);
			out[k] = acc[a] / len;
			out[k + 1] = acc[a + 1] / len;
			out[k + 2] = acc[a + 2] / len;
		}
	}
	return out;
}

/** Inverted-hull shell positions: every vertex pushed out along its normal. */
export function writeShellPositions(positions: Float32Array, normals: Float32Array, thickness: number, out: Float32Array): Float32Array {
	for (let k = 0; k < positions.length; k++) out[k] = positions[k] + normals[k] * thickness;
	return out;
}

/** Axis-aligned bounds of a position array: [minX, minY, minZ, maxX, maxY, maxZ]. */
export function bounds(positions: ArrayLike<number>): [number, number, number, number, number, number] {
	const b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
	for (let k = 0; k < positions.length; k += 3) {
		for (let a = 0; a < 3; a++) {
			const v = positions[k + a];
			if (v < b[a]) b[a] = v;
			if (v > b[a + 3]) b[a + 3] = v;
		}
	}
	return b;
}
