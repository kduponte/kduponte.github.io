// The Forecast Gap hero diorama: one buoy riding its own archived swell on the cut-away sea block,
// with every forecast traced on the block's sides. Pure (no renderer, no DOM) so it can be tested
// in Node; src/scripts/three/subjects/buoy.ts plugs it into the shared viewer.
//
// Scales, all stated on the page:
//   - Horizontal distances on the sea are true: the block is WINDOW_M metres across.
//   - Heights on the sea are stretched VERTICAL_EXAGGERATION times.
//   - The camera is framed once for every station, so the block is always drawn the same size.
//   - The buoys are drawn INSTRUMENT_ENLARGEMENT times larger than the sea's horizontal scale (a
//     0.9 m Waverider at true scale would be a speck on a 400 m patch), all at the same scale, so
//     the 3 m discus is drawn 3.3 times the Waverider's size, as it is.
//   - The water's color is the sea surface temperature at the buoy that hour, on one scale shared
//     by every station (water-color.ts). The water is translucent, so the hull's underside and
//     the mooring, which runs from the eye under the hull to the block's floor, show through.
//   - The buoy rides the drawn surface at the block's center and tilts with its slope. The drawn
//     slope is exaggerated with the heights, so the tilt is softly capped: at MAX_TILT_RAD for the
//     Waverider, and lower for the wide discus, whose deck edge would otherwise dip under.
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { ForecastSystem } from "../surf-forecast/models";
import type { BuoySnapshot, Instrument } from "../surf-forecast/buoy-snapshot";
import { DEFAULT_BUOY_COLORS, buildBuoy, type BuoyModel } from "./buoy-model";
import { CRUISE_SPEED_MS, DEFAULT_CRUISE_SPEED_MS, buildSharkShadow, type SharkPlan } from "./shark";
import { splitAtWaterline, type WaterSplit } from "./underwater";
import { temperatureDomain, waterColor } from "./water-color";
import {
	BASE_H,
	BASE_MARGIN,
	BLOCK_DEPTH,
	TILE,
	UNITS_PER_M,
	buildOceanBlock,
	forecastTraces,
	surfaceHeight,
	surfaceSlope,
	swellField,
	type OceanBlock,
	type SwellReading,
} from "./ocean";

/** Scene units per metre of instrument. */
export const INSTRUMENT_UNITS_PER_M = 0.8;
/** How many times larger than the sea's horizontal scale the buoys are drawn. */
export const INSTRUMENT_ENLARGEMENT = INSTRUMENT_UNITS_PER_M / UNITS_PER_M;
/** Upper bound on the buoy's tilt, radians (about 17 degrees). */
export const MAX_TILT_RAD = 0.3;

/** Recorded shark incidents near a station, as the shadow uses them (see surf-forecast/sharks.ts). */
export interface StationSharks {
	incidents_n: number;
	/** Seconds between shadow passes; null when no incidents were recorded nearby. */
	pass_interval_s: number | null;
	species: string | null;
	length_m: number | null;
}

export interface DioramaStation {
	station: string;
	instrument: Instrument;
	observed: SwellReading;
	forecasts: { system: ForecastSystem; wave_height_m: number; color: string }[];
	sharks?: StationSharks | null;
}

/** The shadow's pass plan for a station, at the buoys' drawing scale; null if it never passes. */
export function sharkPlanFor(s: DioramaStation): SharkPlan | null {
	const k = s.sharks;
	if (!k || !k.pass_interval_s || !k.length_m) return null;
	const speed = (k.species ? CRUISE_SPEED_MS[k.species] : undefined) ?? DEFAULT_CRUISE_SPEED_MS;
	return {
		interval_s: k.pass_interval_s,
		length: k.length_m * INSTRUMENT_UNITS_PER_M,
		speed: speed * INSTRUMENT_UNITS_PER_M,
		seed: Number.parseInt(s.station, 10) || 1,
	};
}

/** A frozen snapshot as the diorama draws it, with each forecast in its system's chart color. */
export function toDioramaStation(s: BuoySnapshot, colors: Record<ForecastSystem, string>, sharks?: StationSharks | null): DioramaStation {
	return {
		station: s.station,
		instrument: s.instrument,
		observed: s.observed,
		forecasts: s.forecasts.map((f) => ({ system: f.system, wave_height_m: f.wave_height_m, color: colors[f.system] })),
		sharks: sharks ?? null,
	};
}

/**
 * The buoy's tilt for a surface gradient: it leans toward the downslope side by the surface's own
 * angle, softly capped so the exaggerated slope never tips it over. Monotonic in the slope, and
 * equal to the true angle for gentle slopes.
 */
export function buoyTilt(slope: { dx: number; dz: number }, maxTilt = MAX_TILT_RAD): { axis: Vector3; angle: number } {
	const s = Math.hypot(slope.dx, slope.dz);
	if (s < 1e-9) return { axis: new Vector3(1, 0, 0), angle: 0 };
	const angle = maxTilt * Math.tanh(Math.atan(s) / maxTilt);
	// Rotating +Y about up x normal tips the buoy's axis toward the surface normal (-dx, 1, -dz).
	const axis = new Vector3(-slope.dz, 0, slope.dx).divideScalar(s);
	return { axis, angle };
}

/** The shared viewer's vertical field of view and framing margin (src/scripts/three/viewer.ts). */
const VIEWER_FOV_DEG = 28;
const VIEWER_MARGIN = 1.12;

const HALF_FOV = ((VIEWER_FOV_DEG / 2) * Math.PI) / 180;
const TAN_HALF_FOV = Math.tan(HALF_FOV);

/** A point to keep in frame: its height, and its horizontal distance away from the camera (negative = nearer). */
export type Extreme = [y: number, away: number];

/**
 * Screen-up offsets from a target at height `ty` on the spin axis, in world units at the target's
 * depth, drawn in perspective from `dist` away. Near points look lower and far points higher than
 * they would in a flat drawing.
 */
function screenUps(extremes: Extreme[], elevation: number, ty: number, dist: number): number[] {
	const c = Math.cos(elevation);
	const s = Math.sin(elevation);
	return extremes.map(([y, away]) => {
		const up = (y - ty) * c + away * s;
		const depth = away * c - (y - ty) * s;
		return (up * dist) / (dist + depth);
	});
}

/**
 * The viewer backs off to halfHeight / sin(fov/2) * margin. With halfHeight = half * cos(fov/2),
 * that puts the frame's edge `half` (plus the margin) from the target, at this distance.
 */
const distanceFor = (half: number) => (half / TAN_HALF_FOV) * VIEWER_MARGIN;

export interface Framing {
	target: Vector3;
	/** In the viewer's terms (see distanceFor). */
	halfHeight: number;
	/** Half the frame's height at the target's depth, before the viewer's margin. */
	half: number;
}

/**
 * A target on the spin axis and a half-height for the viewer's camera so every extreme fits
 * vertically in perspective. The camera distance depends on the half-height, so iterate.
 */
export function frameVertically(extremes: Extreme[], elevation: number): Framing {
	let ty = 0;
	let half = 1;
	for (let i = 0; i < 12; i++) {
		const ups = screenUps(extremes, elevation, ty, distanceFor(half));
		const top = Math.max(...ups);
		const bottom = Math.min(...ups);
		// Re-center: move the target up the axis by the screen offset of the middle.
		ty += (top + bottom) / 2 / Math.cos(elevation);
		half = Math.max((top - bottom) / 2, 1e-3);
	}
	return { target: new Vector3(0, ty, 0), halfHeight: half * Math.cos(HALF_FOV), half };
}

/**
 * The box aspect ratio (width / height) at which a framing's width and height both just fit: the
 * tallest box worth using, since any taller only adds empty space. Wider boxes than this draw the
 * scene smaller (height-bound).
 */
export function frameAspect(framing: { turnRadius: number; halfHeight: number }): number {
	const dv = framing.halfHeight / Math.sin(HALF_FOV);
	const halfH = Math.asin(Math.min(1, framing.turnRadius / dv));
	return Math.tan(halfH) / TAN_HALF_FOV;
}

export interface BuoyDiorama {
	/** Spin this: the block and the buoy turn as one. */
	group: Group;
	/** The pose carrier for the active buoy, for tests. */
	buoyRig: Group;
	stations: DioramaStation[];
	readonly index: number;
	readonly active: BuoyModel;
	setStation(i: number): void;
	/** Pose the sea, buoy and any shark shadow for t seconds. `sharks: false` keeps the shadow away. */
	update(t: number, opts?: { sharks?: boolean }): void;
	/** Lantern glow on the active buoy, 0 = dark. */
	setLantern(intensity: number): void;
	/** The water color drawn for a station (default: the current one). */
	waterColorFor(i?: number): string;
	/** The mooring line, from the block floor to the active buoy's eye, for tests. */
	mooring: Mesh;
	/** The shark shadow, for tests. */
	shark: Mesh;
	framing: { target: Vector3; turnRadius: number; halfHeight: number; viewDir: Vector3 };
	dispose(): void;
}

const modelKey = (s: DioramaStation) => (s.instrument === "discus" ? `discus:${s.station}` : "waverider");

export function buildBuoyDiorama(stations: DioramaStation[], startIndex = 0): BuoyDiorama {
	if (stations.length === 0) throw new Error("buildBuoyDiorama needs at least one station");
	const wrap = (i: number) => ((i % stations.length) + stations.length) % stations.length;
	let index = wrap(startIndex);

	const fieldFor = (s: DioramaStation) => swellField(s.observed);
	const tracesFor = (s: DioramaStation) => forecastTraces(s.observed.wave_height_m, s.forecasts);

	const domain = temperatureDomain(stations.map((s) => s.observed.water_temp_c));
	const waterColors = stations.map((s) => waterColor(s.observed.water_temp_c, domain));

	const group = new Group();
	let field = fieldFor(stations[index]);
	const ocean: OceanBlock = buildOceanBlock(field, tracesFor(stations[index]));
	ocean.setWaterColor(waterColors[index]);
	group.add(ocean.group);

	const buoyRig = new Group();
	group.add(buoyRig);
	// One model per kind of hull, built once: every Waverider station shares the sphere.
	const models = new Map<string, BuoyModel>();
	const splits: WaterSplit[] = [];
	for (const s of stations) {
		const key = modelKey(s);
		if (models.has(key)) continue;
		const m = buildBuoy(s.instrument, s.station);
		m.group.scale.setScalar(INSTRUMENT_UNITS_PER_M);
		m.group.visible = false;
		buoyRig.add(m.group);
		models.set(key, m);
		// Only the submerged part of a hull may show through the water (see underwater.ts).
		splits.push(splitAtWaterline(m.group, m.parts));
	}
	let active = models.get(modelKey(stations[index]))!;
	active.group.visible = true;

	// The mooring: a black rubber line from the eye under the hull straight down to the block's
	// floor (the cut; the real line runs on to the seabed). One unit tall, stretched each frame.
	const mooringGeo = new CylinderGeometry(0.014, 0.014, 1, 8).translate(0, 0.5, 0);
	const mooringMat = new MeshStandardMaterial({ color: DEFAULT_BUOY_COLORS.rubber, roughness: 0.9 });
	const mooring = new Mesh(mooringGeo, mooringMat);
	mooring.userData.kind = "mooring";
	group.add(mooring);
	const anchor = new Vector3(0, -BLOCK_DEPTH, 0);
	const eye = new Vector3();
	const up = new Vector3(0, 1, 0);

	const shark = buildSharkShadow(group, TILE / 2);
	group.add(shark.mesh);
	const plans = stations.map(sharkPlanFor);

	const q = new Quaternion();
	const update = (t: number, opts: { sharks?: boolean } = {}) => {
		ocean.update(t);
		shark.update(opts.sharks === false ? null : plans[index], t);
		buoyRig.position.set(0, surfaceHeight(field, 0, 0, t), 0);
		const { axis, angle } = buoyTilt(surfaceSlope(field, 0, 0, t), active.maxTilt_rad);
		buoyRig.quaternion.copy(q.setFromAxisAngle(axis, angle));
		eye.set(0, active.mooring_m * INSTRUMENT_UNITS_PER_M, 0).applyQuaternion(buoyRig.quaternion).add(buoyRig.position);
		const run = eye.clone().sub(anchor);
		mooring.position.copy(anchor);
		mooring.quaternion.setFromUnitVectors(up, run.clone().normalize());
		mooring.scale.set(1, Math.max(1e-3, run.length()), 1);
	};

	// One frame for every station, so the sea block is drawn the same size whichever buoy is shown.
	// It has to fit the tallest thing any station draws, which is Monterey's 5 m discus mast, not
	// any wave. The extremes are the buoy's top on the spin axis, the water's far corner rising
	// behind it as the block turns, and the plinth's near corner dropping in front. A box tall
	// enough for the mast (see frameAspect) keeps the block as large as the box's width allows.
	const viewDir = new Vector3(5.2, 3.4, 5.9).normalize();
	const elevation = Math.asin(viewDir.y);
	const turnRadius = (TILE / 2 + BASE_MARGIN) * Math.SQRT2;
	const extremesOf = (s: DioramaStation): Extreme[] => {
		const f = fieldFor(s);
		const waterTop = Math.max(1, ...tracesFor(s).map((tr) => tr.heightScale)) * f.amplitude;
		const buoyTop = f.amplitude + models.get(modelKey(s))!.height_m * INSTRUMENT_UNITS_PER_M;
		return [
			[buoyTop, 0],
			[waterTop, (TILE / 2) * Math.SQRT2],
			[-BLOCK_DEPTH - BASE_H, -turnRadius],
		];
	};
	const frame = frameVertically(stations.flatMap(extremesOf), elevation);

	update(0);
	return {
		group,
		buoyRig,
		stations,
		get index() {
			return index;
		},
		get active() {
			return active;
		},
		setStation(i) {
			const next = wrap(i);
			if (next === index) return;
			const lantern = active.lantern.emissiveIntensity;
			index = next;
			field = fieldFor(stations[index]);
			ocean.setField(field, tracesFor(stations[index]));
			ocean.setWaterColor(waterColors[index]);
			active.group.visible = false;
			active = models.get(modelKey(stations[index]))!;
			active.group.visible = true;
			active.lantern.emissiveIntensity = lantern;
		},
		update,
		setLantern(intensity) {
			active.lantern.emissiveIntensity = intensity;
		},
		waterColorFor(i = index) {
			return waterColors[wrap(i)];
		},
		mooring,
		shark: shark.mesh,
		framing: { target: frame.target, turnRadius, halfHeight: frame.halfHeight, viewDir },
		dispose() {
			ocean.dispose();
			mooringGeo.dispose();
			mooringMat.dispose();
			shark.dispose();
			for (const m of models.values()) m.dispose();
			splits.forEach((w) => w.dispose());
		},
	};
}
