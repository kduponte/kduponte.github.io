// The patch of sea under the Forecast Gap buoy: a cut-away block of water whose surface is the
// swell one buoy actually recorded, with each forecasting system's version of it traced on the
// block's sides.
//
// Same discipline as the 2D Linda Mar drawing (src/lib/surf-forecast/swell-viz.ts), whose physics
// this reuses: every property of the surface comes from the reading.
//   - Crest spacing is the true deep-water wavelength for the buoy's dominant period, on a fixed
//     400 m patch, so a 7 s trade swell draws five tight crests and a 13 s south swell barely two.
//   - Crests advance one wavelength per wave period, in real time.
//   - The swell travels away from the buoy's reported direction (MWD is where waves come from).
//   - Height is the buoy's significant wave height, drawn as a single regular swell of that height.
//     Heights are stretched VERTICAL_EXAGGERATION times; horizontal distances are true.
//   - The forecast traces differ from the real one in height only: height is what is scored, and
//     the models' periods are not comparable to the buoy's (see period-definition.ts).
//   - The base carries a north arrow and a 400 m scale bar in 100 m steps, so direction and
//     distance can be read off the model itself. The block's depth is only a cut, not to scale.
import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Shape,
	type Material,
} from "three";
import { WINDOW_M, deepWaterWavelengthM } from "../surf-forecast/swell-viz";
import { createPartKit, extrude, slab, type PartKit } from "./kit";

/** Side length of the water block, in scene units. It represents WINDOW_M metres of sea. */
export const TILE = 6;
/** Scene units per metre of sea, horizontally. */
export const UNITS_PER_M = TILE / WINDOW_M;
/** Heights are stretched this much so a two-metre swell is visible on a 400 m patch. */
export const VERTICAL_EXAGGERATION = 16;
/** Depth of the cut-away block below still water, in scene units (not to scale). */
export const BLOCK_DEPTH = 1.1;
/** Scale-bar step on the base, metres. */
export const SCALE_STEP_M = 100;

export interface SwellReading {
	wave_height_m: number;
	dominant_period_s: number;
	/** Direction the swell comes from, degrees clockwise from true north (MWD). */
	direction_deg: number;
}

export interface SwellField {
	wavelength_m: number;
	period_s: number;
	/** Drawn amplitude (half the height), scene units, after exaggeration. */
	amplitude: number;
	/** Wavenumber in radians per scene unit. */
	k: number;
	/** Angular frequency, radians per second. */
	omega: number;
	/** Unit vector of travel in the scene's XZ plane. North is -Z, east is +X. */
	dir: { x: number; z: number };
}

/** The scene's compass: north is -Z and east is +X. */
export function bearingToSceneVector(bearingDeg: number): { x: number; z: number } {
	const b = (bearingDeg * Math.PI) / 180;
	return { x: Math.sin(b), z: -Math.cos(b) };
}

export function swellField(r: SwellReading): SwellField {
	const wavelength_m = deepWaterWavelengthM(r.dominant_period_s);
	const wavelengthUnits = wavelength_m * UNITS_PER_M;
	return {
		wavelength_m,
		period_s: r.dominant_period_s,
		// Without a period there is no wave shape to draw, so the surface lies at still water.
		amplitude: wavelength_m > 0 ? (Math.max(0, r.wave_height_m) / 2) * UNITS_PER_M * VERTICAL_EXAGGERATION : 0,
		k: wavelengthUnits > 0 ? (2 * Math.PI) / wavelengthUnits : 0,
		omega: r.dominant_period_s > 0 ? (2 * Math.PI) / r.dominant_period_s : 0,
		// Swell travels toward the opposite of where it comes from.
		dir: bearingToSceneVector(r.direction_deg + 180),
	};
}

/** Surface height in scene units at (x, z) and time t seconds, scaled by `heightScale` (1 = the buoy's own reading). */
export function surfaceHeight(f: SwellField, x: number, z: number, t: number, heightScale = 1): number {
	return f.amplitude * heightScale * Math.cos(f.k * (f.dir.x * x + f.dir.z * z) - f.omega * t);
}

/** Surface gradient (dh/dx, dh/dz) of the drawn (exaggerated) surface, for tilting whatever floats on it. */
export function surfaceSlope(f: SwellField, x: number, z: number, t: number): { dx: number; dz: number } {
	const s = -f.amplitude * f.k * Math.sin(f.k * (f.dir.x * x + f.dir.z * z) - f.omega * t);
	return { dx: s * f.dir.x, dz: s * f.dir.z };
}

/** Sanity figure for tests and captions: crest speed in m/s, which deep-water theory fixes at gT/2pi. */
export function crestSpeedMs(f: SwellField): number {
	return f.period_s > 0 ? f.wavelength_m / f.period_s : 0;
}

// ---------------------------------------------------------------- traces

export interface Trace {
	color: string;
	/** Height relative to the buoy's reading: forecast height / observed height. */
	heightScale: number;
	/** Ribbon thickness in scene units. */
	width: number;
}

/** Forecast ribbons are this thick, inside a black edge; the real swell's black line is thicker. */
export const FORECAST_TRACE_WIDTH = 0.036;
export const OBSERVED_TRACE_WIDTH = 0.05;
export const TRACE_EDGE = 0.009;

/**
 * One trace per forecast, in the order given. A forecast draws the buoy's own swell scaled to the
 * forecast height, so a forecast 30% high rides 30% higher at every crest and 30% lower in every
 * trough. With no observed height there is nothing to scale against, so the traces lie flat.
 */
export function forecastTraces(observedM: number, forecasts: { wave_height_m: number; color: string }[]): Trace[] {
	return forecasts.map((f) => ({
		color: f.color,
		heightScale: observedM > 0 ? Math.max(0, f.wave_height_m) / observedM : 0,
		width: FORECAST_TRACE_WIDTH,
	}));
}

// ---------------------------------------------------------------- mesh

export interface OceanColors {
	/** Top of the water. */
	surface: string;
	/** The cut-away walls. Forecast lines carry a black edge, so they stay legible on any blue. */
	side: string;
	base: string;
	outline: string;
	/** The light squares of the scale bar. */
	paper: string;
}

export const DEFAULT_OCEAN_COLORS: OceanColors = {
	surface: "#8fd0ff",
	side: "#5fb6ef",
	base: "#f6f1e4",
	outline: "#111111",
	paper: "#ffffff",
};

export interface OceanBlock {
	group: Group;
	/** Recompute the surface, side walls, corners and traces for time t (seconds). */
	update(t: number): void;
	/** Swap in a new reading and traces without rebuilding the block. Call `update` after. */
	setField(field: SwellField, traces: Trace[]): void;
	dispose(): void;
}

const GRID = 48;
const SIDE_SAMPLES = 64;
const HALF = TILE / 2;
/** Plinth: margin beyond the water on each side, and thickness. */
export const BASE_MARGIN = 0.36;
export const BASE_H = 0.24;

/**
 * The four side faces: the axis sampled along, the fixed coordinate, and whether the strip's
 * natural winding (top_i, bottom_i, top_i+1) has to flip so the face points outward.
 */
const FACES = [
	{ along: "x", at: HALF, flip: false },
	{ along: "x", at: -HALF, flip: true },
	{ along: "z", at: HALF, flip: true },
	{ along: "z", at: -HALF, flip: false },
] as const;
type Face = (typeof FACES)[number];

const faceCoord = (face: Face, s: number) => (face.along === "x" ? { x: s, z: face.at } : { x: face.at, z: s });
/** Push a point on a face outward by `d`. */
const faceOut = (face: Face, d: number) =>
	face.along === "x" ? { x: 0, z: Math.sign(face.at) * d } : { x: Math.sign(face.at) * d, z: 0 };

/** A strip of SIDE_SAMPLES quads with two vertices (top, bottom) per sample, facing outward. */
function stripGeometry(face: Face): { g: BufferGeometry; pos: Float32Array } {
	const g = new BufferGeometry();
	const pos = new Float32Array((SIDE_SAMPLES + 1) * 2 * 3);
	const idx: number[] = [];
	for (let i = 0; i < SIDE_SAMPLES; i++) {
		const a = i * 2;
		if (face.flip) idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
		else idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
	}
	g.setIndex(idx);
	g.setAttribute("position", new BufferAttribute(pos, 3));
	return { g, pos };
}

type Ribbon = {
	face: Face;
	g: BufferGeometry;
	pos: Float32Array;
	mesh: Mesh;
	/** Distance outside the wall, so overlapping traces never z-fight. */
	out: number;
	heightScale: number;
	width: number;
};

export function buildOceanBlock(
	initial: SwellField,
	initialTraces: Trace[],
	colors: OceanColors = DEFAULT_OCEAN_COLORS,
	kitIn?: PartKit,
): OceanBlock {
	const kit = kitIn ?? createPartKit(colors.outline);
	const group = new Group();
	let field = initial;

	// Top surface: a GRID x GRID quad grid, displaced each frame and smooth shaded (flat facets on
	// an oblique swell alias into stripes that aren't in the data).
	const topGeo = kit.geometry(new BufferGeometry());
	const n = GRID + 1;
	const topPos = new Float32Array(n * n * 3);
	const idx: number[] = [];
	for (let i = 0; i < GRID; i++) {
		for (let j = 0; j < GRID; j++) {
			const a = i * n + j;
			idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
		}
	}
	topGeo.setIndex(idx);
	topGeo.setAttribute("position", new BufferAttribute(topPos, 3));
	const surfaceMat = kit.material(new MeshStandardMaterial({ color: colors.surface, roughness: 0.22, metalness: 0.05 }));
	const top = new Mesh(topGeo, surfaceMat);
	top.userData.kind = "surface";
	group.add(top);

	// Side walls: a strip per face from the block floor up to the moving surface edge.
	const sideMat = kit.material(
		new MeshStandardMaterial({ color: colors.side, roughness: 0.85, metalness: 0 }),
	);
	const walls = FACES.map((face) => {
		const { g, pos } = stripGeometry(face);
		kit.geometry(g);
		const m = new Mesh(g, sideMat);
		m.userData.kind = "wall";
		group.add(m);
		return { g, pos };
	});

	// Black corner posts finish the block's outline; each one stretches to its corner's surface height.
	const outlineMat = kit.material(new MeshBasicMaterial({ color: colors.outline }));
	const postGeo = kit.geometry(new BoxGeometry(0.05, 1, 0.05).translate(0, 0.5, 0));
	const corners = [
		[HALF, HALF],
		[HALF, -HALF],
		[-HALF, HALF],
		[-HALF, -HALF],
	].map(([x, z]) => {
		const post = new Mesh(postGeo, outlineMat);
		post.position.set(x + Math.sign(x) * 0.012, -BLOCK_DEPTH, z + Math.sign(z) * 0.012);
		group.add(post);
		return { post, x, z };
	});

	// Traces: flat unlit ribbons just outside each wall. The real swell is a thick black line;
	// each forecast is a thinner line of its system's color inside a thin black edge, drawn on top,
	// so a forecast that nails the reading sits inside the black line.
	const traceMats = new Map<string, Material>();
	const traceMat = (color: string) => {
		let m = traceMats.get(color);
		if (!m) {
			m = kit.material(new MeshBasicMaterial({ color }));
			traceMats.set(color, m);
		}
		return m;
	};
	let ribbons: Ribbon[] = [];
	const ribbon = (face: Face, color: string, out: number, heightScale: number, width: number, data: Record<string, unknown>): Ribbon => {
		const { g, pos } = stripGeometry(face);
		const mesh = new Mesh(g, traceMat(color));
		mesh.userData = { kind: "trace", face: FACES.indexOf(face), ...data };
		group.add(mesh);
		return { face, g, pos, mesh, out, heightScale, width };
	};
	const buildRibbons = (traces: Trace[]) => {
		for (const r of ribbons) {
			group.remove(r.mesh);
			r.g.dispose();
		}
		ribbons = [];
		for (const face of FACES) {
			ribbons.push(ribbon(face, colors.outline, 0.008, 1, OBSERVED_TRACE_WIDTH, { trace: "observed", heightScale: 1 }));
			traces.forEach((tr, i) => {
				const out = 0.014 + i * 0.006;
				ribbons.push(ribbon(face, colors.outline, out, tr.heightScale, tr.width + 2 * TRACE_EDGE, { trace: i, edge: true, heightScale: tr.heightScale }));
				ribbons.push(ribbon(face, tr.color, out + 0.002, tr.heightScale, tr.width, { trace: i, heightScale: tr.heightScale }));
			});
		}
	};
	buildRibbons(initialTraces);

	// Diorama base: a plinth with a north arrow and a scale bar on its rim.
	const baseMat = kit.std(colors.base, 0.7);
	const baseW = TILE + 2 * BASE_MARGIN;
	kit.add(group, slab(baseW, BASE_H, baseW, 0.08, 0.03), baseMat, [0, -BLOCK_DEPTH - BASE_H / 2, 0], { outline: 0.05 });
	const rimY = -BLOCK_DEPTH + 0.012;
	// North arrow on the north rim (-Z), pointing north.
	const arrow = new Shape();
	arrow.moveTo(0, 0.13);
	arrow.lineTo(0.1, -0.09);
	arrow.lineTo(0, -0.04);
	arrow.lineTo(-0.1, -0.09);
	arrow.lineTo(0, 0.13);
	const arrowGeo = extrude(arrow, 0.02, 0.004);
	arrowGeo.rotateX(-Math.PI / 2); // shape +Y becomes scene -Z (north)
	kit.add(group, arrowGeo, outlineMat, [-HALF + 0.3, rimY, -HALF - BASE_MARGIN / 2], { outline: 0 });
	// A block "N" beside it, lying flat on the rim, readable from the south.
	const nCell = { w: 0.12, h: 0.16, stroke: 0.03 };
	const nX = -HALF + 0.52;
	const nZ = -HALF - BASE_MARGIN / 2;
	for (const dx of [-nCell.w / 2, nCell.w / 2]) {
		kit.add(group, slab(nCell.stroke, 0.02, nCell.h, 0.008, 0.004), outlineMat, [nX + dx, rimY, nZ], { outline: 0 });
	}
	kit.add(group, slab(nCell.stroke, 0.02, Math.hypot(nCell.w, nCell.h), 0.008, 0.004), outlineMat, [nX, rimY, nZ], {
		// Local +Z (the stroke's length) turned to run from the top-left (far) to the bottom-right (near).
		rot: [0, Math.atan2(nCell.w, nCell.h), 0],
		outline: 0,
	});
	// Scale bar along the south rim (+Z): WINDOW_M of sea in SCALE_STEP_M steps, alternating ink and paper.
	const steps = Math.round(WINDOW_M / SCALE_STEP_M);
	const stepLen = SCALE_STEP_M * UNITS_PER_M;
	const paperMat = kit.std(colors.paper, 0.8);
	const barZ = HALF + BASE_MARGIN / 2;
	kit.add(group, slab(TILE + 0.03, 0.02, 0.1, 0.006, 0.003), outlineMat, [0, rimY - 0.002, barZ], { outline: 0 });
	for (let i = 0; i < steps; i++) {
		const x = -HALF + stepLen * (i + 0.5);
		kit.add(group, slab(stepLen - 0.02, 0.024, 0.07, 0.004, 0.002), i % 2 ? paperMat : outlineMat, [x, rimY + 0.004, barZ], { outline: 0 }).userData.kind =
			"scale-step";
	}

	const update = (t: number) => {
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				const x = -HALF + (TILE * j) / GRID;
				const z = -HALF + (TILE * i) / GRID;
				const o = (i * n + j) * 3;
				topPos[o] = x;
				topPos[o + 1] = surfaceHeight(field, x, z, t);
				topPos[o + 2] = z;
			}
		}
		topGeo.attributes.position.needsUpdate = true;
		topGeo.computeVertexNormals();
		topGeo.computeBoundingSphere();

		FACES.forEach((face, fi) => {
			const { g, pos } = walls[fi];
			for (let i = 0; i <= SIDE_SAMPLES; i++) {
				const { x, z } = faceCoord(face, -HALF + (TILE * i) / SIDE_SAMPLES);
				pos.set([x, surfaceHeight(field, x, z, t), z, x, -BLOCK_DEPTH, z], i * 6);
			}
			g.attributes.position.needsUpdate = true;
			g.computeVertexNormals();
			g.computeBoundingSphere();
		});

		for (const r of ribbons) {
			const o = faceOut(r.face, r.out);
			for (let i = 0; i <= SIDE_SAMPLES; i++) {
				const { x, z } = faceCoord(r.face, -HALF + (TILE * i) / SIDE_SAMPLES);
				const h = surfaceHeight(field, x, z, t, r.heightScale);
				r.pos.set([x + o.x, h + r.width / 2, z + o.z, x + o.x, h - r.width / 2, z + o.z], i * 6);
			}
			r.g.attributes.position.needsUpdate = true;
			r.g.computeBoundingSphere();
		}

		for (const c of corners) c.post.scale.y = Math.max(1e-3, surfaceHeight(field, c.x, c.z, t) + BLOCK_DEPTH);
	};

	update(0);
	return {
		group,
		update,
		setField(next, nextTraces) {
			field = next;
			buildRibbons(nextTraces);
		},
		dispose() {
			for (const r of ribbons) r.g.dispose();
			kit.dispose();
		},
	};
}
