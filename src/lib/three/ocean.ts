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
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, type Material } from "three";
import { WINDOW_M, deepWaterWavelengthM } from "../surf-forecast/swell-viz";
import { createPartKit, slab, type PartKit } from "./kit";

/** Side length of the water block, in scene units. It represents WINDOW_M metres of sea. */
export const TILE = 6;
/** Scene units per metre of sea, horizontally. */
export const UNITS_PER_M = TILE / WINDOW_M;
/** Heights are stretched this much so a two-metre swell is visible on a 400 m patch. */
export const VERTICAL_EXAGGERATION = 16;
/** Depth of the cut-away block below still water, in scene units (not to scale). */
export const BLOCK_DEPTH = 1.1;

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
		amplitude: (r.wave_height_m / 2) * UNITS_PER_M * VERTICAL_EXAGGERATION,
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

/** Surface gradient (dh/dx, dh/dz) in scene units, for tilting whatever floats on it. */
export function surfaceSlope(f: SwellField, x: number, z: number, t: number): { dx: number; dz: number } {
	const s = -f.amplitude * f.k * Math.sin(f.k * (f.dir.x * x + f.dir.z * z) - f.omega * t);
	return { dx: s * f.dir.x, dz: s * f.dir.z };
}

/** Sanity figure for tests and captions: crest speed in m/s, which deep-water theory fixes at gT/2pi. */
export function crestSpeedMs(f: SwellField): number {
	return f.period_s > 0 ? f.wavelength_m / f.period_s : 0;
}

// ---------------------------------------------------------------- mesh

export interface Trace {
	color: string;
	/** Height relative to the buoy's reading: forecast height / observed height. */
	heightScale: number;
	/** Ribbon thickness in scene units. */
	width: number;
}

export interface OceanBlock {
	group: Group;
	/** Recompute the surface, side walls and traces for time t (seconds). */
	update(t: number): void;
	/** Swap in a new reading and traces without rebuilding the mesh. */
	setField(field: SwellField, traces: Trace[]): void;
	dispose(): void;
}

const GRID = 48;
const SIDE_SAMPLES = 64;
const HALF = TILE / 2;

/** The four side faces: an axis to sample along, and the fixed coordinate and outward sign. */
const FACES = [
	{ along: "x", fixed: "z", at: HALF },
	{ along: "x", fixed: "z", at: -HALF },
	{ along: "z", fixed: "x", at: HALF },
	{ along: "z", fixed: "x", at: -HALF },
] as const;

export function buildOceanBlock(
	initial: SwellField,
	initialTraces: Trace[],
	colors: { surface: string; side: string; base: string; outline: string; north: string },
	kitIn?: PartKit,
): OceanBlock {
	const kit = kitIn ?? createPartKit(colors.outline);
	const group = new Group();
	let field = initial;
	let traces = initialTraces;

	// Top surface: a GRID x GRID quad grid, displaced each frame.
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
	const surfaceMat = kit.std(colors.surface, 0.18, 0.05);
	const top = new Mesh(topGeo, surfaceMat);
	group.add(top);

	// Side walls: a strip per face from the block floor up to the moving surface edge.
	const sideMat = kit.material(new MeshStandardMaterial({ color: colors.side, roughness: 0.4, side: DoubleSide }));
	const walls = FACES.map(() => {
		const g = kit.geometry(new BufferGeometry());
		const pos = new Float32Array((SIDE_SAMPLES + 1) * 2 * 3);
		const wi: number[] = [];
		for (let i = 0; i < SIDE_SAMPLES; i++) {
			const a = i * 2;
			wi.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
		}
		g.setIndex(wi);
		g.setAttribute("position", new BufferAttribute(pos, 3));
		const m = new Mesh(g, sideMat);
		group.add(m);
		return { g, pos };
	});

	// Traces: a flat ribbon just outside each face, one for the real swell (black) and one per forecast.
	const ribbonMats = new Map<string, Material>();
	const ribbonMat = (color: string) => {
		let m = ribbonMats.get(color);
		if (!m) {
			m = kit.material(new MeshStandardMaterial({ color, roughness: 0.6, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
			ribbonMats.set(color, m);
		}
		return m;
	};
	type Ribbon = { g: BufferGeometry; pos: Float32Array; mesh: Mesh };
	let ribbons: Ribbon[][] = [];
	const buildRibbons = () => {
		for (const set of ribbons) for (const r of set) group.remove(r.mesh);
		ribbons = FACES.map((_, fi) =>
			[{ color: colors.outline, heightScale: 1, width: 0.05 }, ...traces].map((tr, ti) => {
				const g = kit.geometry(new BufferGeometry());
				const pos = new Float32Array((SIDE_SAMPLES + 1) * 2 * 3);
				const ri: number[] = [];
				for (let i = 0; i < SIDE_SAMPLES; i++) {
					const a = i * 2;
					ri.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
				}
				g.setIndex(ri);
				g.setAttribute("position", new BufferAttribute(pos, 3));
				const mesh = new Mesh(g, ribbonMat(tr.color));
				// Draw the real swell's line last so it sits on top where traces cross it.
				mesh.renderOrder = ti === 0 ? 2 : 1;
				mesh.userData = { face: fi, trace: tr };
				group.add(mesh);
				return { g, pos, mesh };
			}),
		);
	};
	buildRibbons();

	// Static diorama base under the block, with a north marker so the swell direction can be read.
	const baseH = 0.22;
	kit.add(group, slab(TILE + 0.24, baseH, TILE + 0.24, 0.06, 0.03), kit.std(colors.base, 0.6), [0, -BLOCK_DEPTH - baseH / 2, 0], {
		outline: 0.04,
	});
	const arrow = kit.geometry(new BufferGeometry());
	arrow.setAttribute(
		"position",
		new BufferAttribute(new Float32Array([0, 0, -0.32, -0.16, 0, 0, 0.16, 0, 0]), 3),
	);
	arrow.computeVertexNormals();
	const north = new Mesh(arrow, kit.material(new MeshStandardMaterial({ color: colors.north, side: DoubleSide })));
	north.position.set(0, -BLOCK_DEPTH + 0.002, -HALF - 0.02);
	group.add(north);

	const coord = (face: (typeof FACES)[number], s: number) =>
		face.along === "x" ? { x: s, z: face.at } : { x: face.at, z: s };

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

		FACES.forEach((face, fi) => {
			const { g, pos } = walls[fi];
			for (let i = 0; i <= SIDE_SAMPLES; i++) {
				const s = -HALF + (TILE * i) / SIDE_SAMPLES;
				const { x, z } = coord(face, s);
				const h = surfaceHeight(field, x, z, t);
				const o = i * 6;
				pos.set([x, h, z, x, -BLOCK_DEPTH, z], o);
			}
			g.attributes.position.needsUpdate = true;
			g.computeVertexNormals();

			const out = 0.012;
			for (const r of ribbons[fi]) {
				const tr = r.mesh.userData.trace as Trace & { heightScale: number };
				for (let i = 0; i <= SIDE_SAMPLES; i++) {
					const s = -HALF + (TILE * i) / SIDE_SAMPLES;
					const { x, z } = coord(face, s);
					const h = surfaceHeight(field, x, z, t, tr.heightScale);
					const ox = face.fixed === "x" ? Math.sign(face.at) * out : 0;
					const oz = face.fixed === "z" ? Math.sign(face.at) * out : 0;
					r.pos.set([x + ox, h + tr.width / 2, z + oz, x + ox, h - tr.width / 2, z + oz], i * 6);
				}
				r.g.attributes.position.needsUpdate = true;
				r.g.computeVertexNormals();
			}
		});
	};

	update(0);
	return {
		group,
		update,
		setField(next, nextTraces) {
			field = next;
			traces = nextTraces;
			buildRibbons();
		},
		dispose: kit.dispose,
	};
}
