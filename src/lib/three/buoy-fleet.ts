// "The twelve buoys": every station's buoy, built at true size in metres, floating on one cut-away
// block of still water so their sizes compare directly (the Waverider spheres against Monterey's
// 3 m hull and its 4.1 m anemometer mast).
//
// - One row per region (Hawaii at the back, then Northern and Southern California), each running
//   west to east by the buoy's longitude. Hulls sit FLEET_GAP_M apart edge to edge, so the layout
//   follows from the hulls' own widths and nothing else.
// - The water is the hero's translucent sea, flat: each hull floats at its own waterline and its
//   submerged half shows through (split by pass, as in underwater.ts, so the water never refracts a
//   ghost of a mast). The block is cut FLEET_FLOOR_CLEARANCE_M below the deepest hull.
// - The plinth's front rim carries a scale bar in 1 m steps.
// - The selected station's lantern glows and a black ring marks it on the water.
import { BackSide, Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, TorusGeometry, Vector3 } from "three";
import type { Instrument } from "../surf-forecast/buoy-snapshot";
import type { Region } from "../surf-forecast/spots";
import { buildBuoy, type BuoyModel } from "./buoy-model";
import { frameVertically, type Extreme } from "./buoy-diorama";
import { createPartKit, shade, slab, tint } from "./kit";
import { DEFAULT_OCEAN_COLORS, SEAWATER_IOR } from "./ocean";
import { splitAtWaterline, type WaterSplit } from "./underwater";

export interface FleetStation {
	station: string;
	name: string;
	region: Region;
	instrument: Instrument;
	longitude: number;
}

export const FLEET_REGIONS: Region[] = ["hawaii", "norcal", "socal"];
/** Clear water between neighbouring hulls, and between rows, metres. */
export const FLEET_GAP_M = 0.35;
/** Water beyond the outermost hulls. */
export const FLEET_MARGIN_M = 0.45;
/** How far below the deepest hull the block is cut. */
export const FLEET_FLOOR_CLEARANCE_M = 0.3;
export const FLEET_PLINTH_MARGIN_M = 0.35;
export const FLEET_PLINTH_H_M = 0.3;
export const FLEET_SCALE_STEP_M = 1;
/** Lantern glow on the selected buoy (the hero's hover glow), and how fast it eases, per second. */
const LANTERN_ON = 1.8;
/** The site's lime, which also marks the selected card. */
export const SELECTION_COLOR = "#c8ff3d";
const LANTERN_EASE = 6;

export interface FleetLayout {
	/** Each station's position on the water, by the stations' own index. */
	slots: { x: number; z: number }[];
	/** The water's extent: X across the rows, Z front to back. */
	width: number;
	depth: number;
	rows: { region: Region; z: number; indices: number[] }[];
}

/** Rows by region, west to east, hulls `gap` apart edge to edge, centered on the origin. */
export function fleetLayout(stations: FleetStation[], radiusOf: (i: number) => number, gap = FLEET_GAP_M, margin = FLEET_MARGIN_M): FleetLayout {
	const slots = stations.map(() => ({ x: 0, z: 0 }));
	const rows = FLEET_REGIONS.map((region) => ({
		region,
		indices: stations
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.region === region)
			.sort((a, b) => a.s.longitude - b.s.longitude)
			.map(({ i }) => i),
	})).filter((r) => r.indices.length > 0);

	let widest = 0;
	const halfDepths = rows.map((r) => Math.max(...r.indices.map(radiusOf)));
	for (const r of rows) {
		let x = 0;
		r.indices.forEach((i, k) => {
			if (k > 0) x += radiusOf(r.indices[k - 1]) + gap + radiusOf(i);
			slots[i].x = x;
		});
		const left = -radiusOf(r.indices[0]);
		const right = x + radiusOf(r.indices[r.indices.length - 1]);
		const shift = (left + right) / 2;
		for (const i of r.indices) slots[i].x -= shift;
		widest = Math.max(widest, right - left);
	}
	const total = halfDepths.reduce((a, h) => a + 2 * h, 0) + gap * (rows.length - 1);
	let z = -total / 2;
	const placed = rows.map((r, k) => {
		const rz = z + halfDepths[k];
		z += 2 * halfDepths[k] + gap;
		for (const i of r.indices) slots[i].z = rz;
		return { region: r.region, z: rz, indices: r.indices };
	});
	return { slots, width: widest + 2 * margin, depth: total + 2 * margin, rows: placed };
}

/** Horizontal reach of a model from its axis (fender or rub rail included). */
function reachOf(model: BuoyModel): number {
	const b = new Box3().setFromObject(model.group);
	return Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
}

export interface BuoyFleet {
	group: Group;
	models: BuoyModel[];
	/** Each buoy's horizontal reach from its axis, metres. */
	reach: number[];
	layout: FleetLayout;
	/** How far below still water the block is cut, metres. */
	blockDepth: number;
	readonly index: number;
	setStation(i: number): void;
	/** Ease the lanterns toward the selection; instantly when `instant`. */
	update(dt: number, instant?: boolean): void;
	busy(): boolean;
	framing: { target: Vector3; turnRadius: number; halfHeight: number; viewDir: Vector3 };
	dispose(): void;
}

export function buildBuoyFleet(stations: FleetStation[], startIndex = 0): BuoyFleet {
	if (!stations.length) throw new Error("buildBuoyFleet: no stations");
	const colors = DEFAULT_OCEAN_COLORS;
	const kit = createPartKit(colors.outline);
	const group = new Group();

	const models = stations.map((s) => buildBuoy(s.instrument, s.station));
	const reach = models.map(reachOf);
	const layout = fleetLayout(stations, (i) => reach[i]);
	const deepest = Math.min(...models.map((m) => new Box3().setFromObject(m.group).min.y));
	const blockDepth = -deepest + FLEET_FLOOR_CLEARANCE_M;
	const { width: W, depth: D } = layout;

	// Still water: a translucent block (the hero's sea material) over its opaque inside.
	const waterMat = kit.material(
		new MeshPhysicalMaterial({
			color: tint(colors.water, 0.35),
			transmission: 1,
			roughness: 0.12,
			ior: SEAWATER_IOR,
			thickness: 0.6,
			attenuationColor: colors.water,
			attenuationDistance: 2.5,
			clearcoat: 1,
			clearcoatRoughness: 0.22,
		}),
	);
	const insideMat = kit.material(new MeshStandardMaterial({ color: shade(colors.water, 0.12), roughness: 0.9, side: BackSide }));
	const blockGeo = kit.geometry(new BoxGeometry(W, blockDepth, D).translate(0, -blockDepth / 2, 0));
	const water = new Mesh(blockGeo, waterMat);
	water.userData.kind = "water";
	group.add(water);
	const inside = new Mesh(blockGeo, insideMat);
	inside.userData.kind = "inside";
	group.add(inside);

	// Black edges along the top rim and down the corners. Flagged transparent (at full opacity) so
	// they draw after the water rather than into its refraction buffer.
	const ink = kit.material(new MeshBasicMaterial({ color: colors.outline, transparent: true }));
	const e = 0.05;
	for (const sz of [-1, 1]) kit.add(group, new BoxGeometry(W + e, e, e), ink, [0, 0, (sz * D) / 2], { outline: 0 });
	for (const sx of [-1, 1]) kit.add(group, new BoxGeometry(e, e, D + e), ink, [(sx * W) / 2, 0, 0], { outline: 0 });
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(group, new BoxGeometry(e, blockDepth, e), ink, [(sx * W) / 2, -blockDepth / 2, (sz * D) / 2], { outline: 0 });

	// Plinth, with the scale bar along its front rim in 1 m steps, alternating ink and paper. Its top
	// sits a few millimetres under the water's floor: level with it, the two would fight in the
	// refraction buffer and show through the water as pale blocks.
	const pm = FLEET_PLINTH_MARGIN_M;
	const plinthTop = -blockDepth - 0.006;
	kit.add(group, slab(W + 2 * pm, FLEET_PLINTH_H_M, D + 2 * pm, 0.1, 0.04), kit.std(colors.base, 0.7), [0, plinthTop - FLEET_PLINTH_H_M / 2, 0], {
		outline: 0.06,
	});
	const rimY = plinthTop + 0.012;
	const barZ = D / 2 + pm / 2;
	const steps = Math.floor(W / FLEET_SCALE_STEP_M);
	const paper = kit.std(colors.paper, 0.8);
	const x0 = -(steps * FLEET_SCALE_STEP_M) / 2;
	kit.add(group, slab(steps * FLEET_SCALE_STEP_M + 0.04, 0.02, 0.13, 0.006, 0.003), ink, [0, rimY - 0.002, barZ], { outline: 0 });
	for (let i = 0; i < steps; i++) {
		kit.add(group, slab(FLEET_SCALE_STEP_M - 0.03, 0.024, 0.09, 0.004, 0.002), i % 2 ? paper : ink, [x0 + FLEET_SCALE_STEP_M * (i + 0.5), rimY + 0.004, barZ], {
			outline: 0,
		}).userData.kind = "scale-step";
	}

	// The buoys, each split at its waterline for the translucent water, and a ring for the selection:
	// the selected card's lime, edged in black so it reads on pale water.
	const splits: WaterSplit[] = [];
	const ringEdge = kit.material(new MeshBasicMaterial({ color: colors.outline, transparent: true }));
	const ringFill = kit.material(new MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true }));
	const rings = models.map((m, i) => {
		m.group.position.set(layout.slots[i].x, 0, layout.slots[i].z);
		m.group.userData.station = stations[i].station;
		group.add(m.group);
		splits.push(splitAtWaterline(m.group, m.parts));
		const ring = new Group();
		const r = reach[i] + 0.2;
		ring.add(new Mesh(kit.geometry(new TorusGeometry(r, 0.075, 10, 72).rotateX(Math.PI / 2)), ringEdge));
		const fill = new Mesh(kit.geometry(new TorusGeometry(r, 0.05, 10, 72).rotateX(Math.PI / 2)), ringFill);
		fill.position.y = 0.03;
		ring.add(fill);
		ring.position.set(layout.slots[i].x, 0.01, layout.slots[i].z);
		ring.visible = false;
		ring.userData.kind = "selection";
		group.add(ring);
		return ring;
	});

	const wrap = (i: number) => ((i % stations.length) + stations.length) % stations.length;
	let index = wrap(startIndex);
	const glow: number[] = models.map((_, i) => (i === index ? LANTERN_ON : 0));
	const apply = () => {
		models.forEach((m, i) => (m.lantern.emissiveIntensity = glow[i]));
		rings.forEach((r, i) => (r.visible = i === index));
	};
	apply();

	// One frame that fits the whole turning fleet: every buoy's top at its distance from the axis
	// (in front of and behind it, as it turns), the water's far corner and the plinth's near corner.
	const viewDir = new Vector3(5.2, 3.4, 5.9).normalize();
	const elevation = Math.asin(viewDir.y);
	const waterR = Math.hypot(W / 2, D / 2);
	const turnRadius = Math.hypot(W / 2 + pm, D / 2 + pm);
	const extremes: Extreme[] = models.flatMap((m, i): Extreme[] => {
		const d = Math.hypot(layout.slots[i].x, layout.slots[i].z);
		return [
			[m.height_m, d],
			[m.height_m, -d],
		];
	});
	extremes.push([0, waterR], [plinthTop - FLEET_PLINTH_H_M, -turnRadius]);
	const frame = frameVertically(extremes, elevation);

	return {
		group,
		models,
		reach,
		layout,
		blockDepth,
		get index() {
			return index;
		},
		setStation(i) {
			index = wrap(i);
			rings.forEach((r, k) => (r.visible = k === index));
		},
		update(dt, instant = false) {
			for (let i = 0; i < glow.length; i++) {
				const target = i === index ? LANTERN_ON : 0;
				glow[i] = instant ? target : glow[i] + (target - glow[i]) * Math.min(1, dt * LANTERN_EASE);
			}
			apply();
		},
		busy: () => glow.some((g, i) => Math.abs(g - (i === index ? LANTERN_ON : 0)) >= 0.01),
		framing: { target: frame.target, turnRadius, halfHeight: frame.halfHeight, viewDir },
		dispose() {
			kit.dispose();
			models.forEach((m) => m.dispose());
			splits.forEach((s) => s.dispose());
		},
	};
}
