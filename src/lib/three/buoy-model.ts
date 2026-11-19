// The two kinds of wave buoy behind The Forecast Gap's twelve stations, modeled in metres with the
// still-water line at y = 0 and +Y up.
//
// - Eleven stations are CDIP Datawell Directional Waverider MkIII buoys: a 0.9 m stainless sphere
//   (0.9 m excludes the fender, per Datawell's spec), floating at about its equator, with a black
//   rubber fender around the waterline, a bolted hatch on top carrying the LED flash and antenna,
//   and small solar panels on the upper hemisphere.
// - Monterey, NDBC 46042, is a 3 m aluminum discus hull with a tripod tower. NDBC puts its
//   anemometers at a nominal 5 m above the waterline on these hulls, which sets the cross-arm.
//
// Both are built at true size, so drawn at one shared scale the discus dwarfs the Waveriders the
// way it does in the water. Details below the waterline (keel, mooring eye) are omitted: the sea
// block hides them.
import {
	CylinderGeometry,
	Euler,
	Group,
	LatheGeometry,
	Mesh,
	Quaternion,
	SphereGeometry,
	TorusGeometry,
	Vector2,
	Vector3,
	type Material,
	type MeshStandardMaterial,
	type Object3D,
} from "three";
import type { Instrument } from "../surf-forecast/buoy-snapshot";
import { createPartKit, shade, slab, type PartKit } from "./kit";

export const WAVERIDER_DIAMETER_M = 0.9;
export const DISCUS_DIAMETER_M = 3;
/** NDBC's nominal anemometer height on a 3 m discus, metres above the waterline. */
export const DISCUS_ANEMOMETER_HEIGHT_M = 5;

/** Outline shells, in metres: hull-sized parts and fittings. */
export const BUOY_OUTLINE_M = 0.06;
export const BUOY_OUTLINE_SMALL_M = 0.03;

export interface BuoyColors {
	hull: string;
	/** Rubber fender and rub rail. */
	rubber: string;
	/** Stainless and aluminum. */
	steel: string;
	/** Solar cells. */
	panel: string;
	/** Lantern lens; also its glow. */
	lens: string;
	/** Outlines, caps, lettering. */
	ink: string;
}

export const DEFAULT_BUOY_COLORS: BuoyColors = {
	hull: "#ffd400",
	rubber: "#1a1a1a",
	steel: "#d6dadd",
	panel: "#1f2a44",
	lens: "#fff1a6",
	ink: "#111111",
};

export interface BuoyModel {
	instrument: Instrument;
	group: Group;
	/** Every visible mesh (excludes outline shells). */
	parts: Mesh[];
	/** The lantern lens, emissive, for a glow. Starts dark. */
	lantern: MeshStandardMaterial;
	/** Hull diameter, metres (the Waverider's excludes its fender). */
	diameter_m: number;
	/** Highest point above the waterline, metres. */
	height_m: number;
	/**
	 * Most the drawn buoy may tilt on the exaggerated sea, radians. A wide, low hull gets less, so
	 * its deck edge never dips more than a third of its freeboard.
	 */
	maxTilt_rad: number;
	dispose(): void;
}

interface Materials {
	hull: MeshStandardMaterial;
	rubber: MeshStandardMaterial;
	steel: MeshStandardMaterial;
	panel: MeshStandardMaterial;
	ink: MeshStandardMaterial;
	lens: MeshStandardMaterial;
}

function materials(kit: PartKit, c: BuoyColors): Materials {
	const lens = kit.std(c.lens, 0.25, 0);
	lens.emissive.set(c.lens);
	lens.emissiveIntensity = 0;
	return {
		hull: kit.std(c.hull, 0.42, 0.1),
		rubber: kit.std(c.rubber, 0.92),
		steel: kit.std(c.steel, 0.3, 0.85),
		panel: kit.std(c.panel, 0.2, 0.35),
		ink: kit.std(c.ink, 0.7),
		lens,
	};
}

const UP = new Vector3(0, 1, 0);

/** A round bar from a to b. */
function bar(kit: PartKit, parent: Object3D, a: Vector3, b: Vector3, r: number, mat: Material, outline = 0): Mesh {
	const d = b.clone().sub(a);
	const geo = new CylinderGeometry(r, r, d.length(), 8);
	const rot = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
	const mid = a.clone().add(b).multiplyScalar(0.5);
	return kit.add(parent, geo, mat, [mid.x, mid.y, mid.z], { rot: [rot.x, rot.y, rot.z], outline });
}

/** A flat part lying tangent to a sphere at latitude `lat`, azimuth `az` (radians), long side along the latitude line. */
function tangentRot(lat: number, az: number): [number, number, number] {
	// XYZ Euler applies Z first: tip the +Y normal down to the latitude, then swing it to the azimuth.
	return [0, -az, -(Math.PI / 2 - lat)];
}

/** Stroke glyphs on a 0.75 x 1 cell, for the hull lettering. */
const GLYPHS: Record<string, [number, number, number, number][]> = {
	N: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 0],
		[0.75, 0, 0.75, 1],
	],
	O: [
		[0, 0, 0.75, 0],
		[0.75, 0, 0.75, 1],
		[0.75, 1, 0, 1],
		[0, 1, 0, 0],
	],
	A: [
		[0, 0, 0.375, 1],
		[0.75, 0, 0.375, 1],
		[0.17, 0.36, 0.58, 0.36],
	],
	"0": [
		[0, 0, 0.75, 0],
		[0.75, 0, 0.75, 1],
		[0.75, 1, 0, 1],
		[0, 1, 0, 0],
	],
	"2": [
		[0, 1, 0.75, 1],
		[0.75, 1, 0.75, 0.5],
		[0.75, 0.5, 0, 0.5],
		[0, 0.5, 0, 0],
		[0, 0, 0.75, 0],
	],
	"4": [
		[0, 1, 0, 0.5],
		[0, 0.5, 0.75, 0.5],
		[0.75, 1, 0.75, 0],
	],
	"6": [
		[0.75, 1, 0, 1],
		[0, 1, 0, 0],
		[0, 0, 0.75, 0],
		[0.75, 0, 0.75, 0.5],
		[0.75, 0.5, 0, 0.5],
	],
};

/**
 * Raised lettering around the outside of a vertical cylinder of radius `r`, centered on azimuth
 * `az` (radians, from +X toward +Z) at height `y`, reading left to right from outside.
 */
function hullLettering(kit: PartKit, parent: Object3D, text: string, r: number, az: number, y: number, height: number, mat: Material) {
	const stroke = height * 0.18;
	const cellW = 0.75 * height;
	const gap = 0.35 * height;
	const total = text.length * cellW + (text.length - 1) * gap;
	[...text].forEach((ch, i) => {
		const strokes = GLYPHS[ch];
		if (!strokes) return;
		const u0 = -total / 2 + i * (cellW + gap) + cellW / 2;
		// Moving right along the hull, seen from outside, is moving toward smaller azimuth.
		const theta = az - u0 / r;
		const glyph = new Group();
		glyph.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
		glyph.rotation.y = Math.PI / 2 - theta; // local +Z points out of the hull, local +X to the reader's right
		for (const [a, b, c, d] of strokes) {
			const du = (c - a) * height;
			const dv = (d - b) * height;
			const u = ((a + c) / 2 - 0.375) * height;
			const v = ((b + d) / 2 - 0.5) * height;
			kit.add(glyph, slab(Math.hypot(du, dv) + stroke, stroke, 0.012, stroke * 0.3, 0.003), mat, [u, v, 0], {
				rot: [0, 0, Math.atan2(dv, du)],
				outline: 0,
			}).userData.kind = "letter";
		}
		parent.add(glyph);
	});
}

/** A ring of bolt heads, flat on a horizontal flange. */
function boltRing(kit: PartKit, parent: Object3D, n: number, r: number, y: number, mat: Material, size = 0.012) {
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		kit.add(parent, new CylinderGeometry(size, size, size * 1.4, 6), mat, [Math.cos(a) * r, y, Math.sin(a) * r], { outline: 0 });
	}
}

// ---------------------------------------------------------------- Waverider

export function buildWaverider(colors: BuoyColors = DEFAULT_BUOY_COLORS): BuoyModel {
	const kit = createPartKit(colors.ink);
	const m = materials(kit, colors);
	const group = new Group();
	const R = WAVERIDER_DIAMETER_M / 2;
	const cy = 0.03; // equator a few centimetres above still water
	const surfaceY = (r: number) => cy + Math.sqrt(Math.max(0, R * R - r * r));

	kit.add(group, new SphereGeometry(R, 48, 32), m.hull, [0, cy, 0], { outline: BUOY_OUTLINE_M }).userData.kind = "hull";

	// Black rubber fender around the equator, with a lighter molded seam on its crown.
	const fender = new TorusGeometry(R + 0.025, 0.045, 14, 64);
	fender.rotateX(Math.PI / 2);
	kit.add(group, fender, m.rubber, [0, cy, 0], { outline: 0 }).userData.kind = "fender";
	const seam = new TorusGeometry(R + 0.03, 0.006, 6, 64);
	seam.rotateX(Math.PI / 2);
	kit.add(group, seam, kit.std(shade("#ffffff", 0.55), 0.8), [0, cy + 0.042, 0], { outline: 0 });

	// Stainless hatch: a flange bolted to the hull, a domed cover, and a lifting eye.
	const hatchR = 0.17;
	const flangeY = surfaceY(hatchR + 0.03);
	kit.add(group, new CylinderGeometry(hatchR + 0.035, hatchR + 0.045, 0.03, 40), m.steel, [0, flangeY, 0], { outline: BUOY_OUTLINE_SMALL_M }).userData.kind =
		"hatch";
	boltRing(kit, group, 12, hatchR + 0.018, flangeY + 0.018, m.ink, 0.01);
	kit.add(group, new CylinderGeometry(hatchR - 0.01, hatchR, 0.05, 40), m.steel, [0, flangeY + 0.035, 0], { outline: 0 });
	const capTop = flangeY + 0.06;

	// Light mast: a short stainless post carrying the LED flash, with the antenna whip above it.
	const mastTop = capTop + 0.2;
	kit.add(group, new CylinderGeometry(0.03, 0.04, 0.03, 16), m.ink, [0, capTop + 0.015, 0], { outline: 0 });
	kit.add(group, new CylinderGeometry(0.022, 0.022, mastTop - capTop, 12), m.steel, [0, (capTop + mastTop) / 2, 0], { outline: 0 });
	const lensH = 0.09;
	kit.add(group, new CylinderGeometry(0.05, 0.05, 0.02, 20), m.ink, [0, mastTop + 0.01, 0], { outline: 0 });
	kit.add(group, new CylinderGeometry(0.045, 0.045, lensH, 20), m.lens, [0, mastTop + 0.02 + lensH / 2, 0], {
		outline: BUOY_OUTLINE_SMALL_M,
	}).userData.kind = "lantern";
	const lensTop = mastTop + 0.02 + lensH;
	kit.add(group, new CylinderGeometry(0.035, 0.05, 0.025, 20), m.ink, [0, lensTop + 0.0125, 0], { outline: 0 });
	const whipBase = lensTop + 0.025;
	const whipTop = whipBase + 0.5;
	kit.add(group, new CylinderGeometry(0.005, 0.008, whipTop - whipBase, 6), m.ink, [0, (whipBase + whipTop) / 2, 0], { outline: 0 }).userData.kind =
		"antenna";
	kit.add(group, new SphereGeometry(0.014, 10, 8), m.ink, [0, whipTop, 0], { outline: 0 });

	// A lifting eye beside the mast.
	const eye = new TorusGeometry(0.04, 0.01, 8, 16, Math.PI);
	kit.add(group, eye, m.steel, [0.1, capTop, 0], { outline: 0 });

	// Four small solar panels on the upper hemisphere, in aluminum frames, between the fender and hatch.
	const lat = (50 * Math.PI) / 180;
	for (let i = 0; i < 4; i++) {
		const az = Math.PI / 4 + (i * Math.PI) / 2;
		const p = (lift: number) => {
			const rr = R + lift;
			return [Math.cos(lat) * Math.cos(az) * rr, cy + Math.sin(lat) * rr, Math.cos(lat) * Math.sin(az) * rr] as [number, number, number];
		};
		const rot = tangentRot(lat, az);
		kit.add(group, slab(0.2, 0.012, 0.15, 0.015, 0.004), m.steel, p(0.002), { rot, outline: 0 });
		kit.add(group, slab(0.18, 0.012, 0.13, 0.012, 0.003), m.panel, p(0.008), { rot, outline: 0 }).userData.kind = "solar";
	}

	return {
		instrument: "waverider",
		group,
		parts: kit.parts,
		lantern: m.lens,
		diameter_m: WAVERIDER_DIAMETER_M,
		height_m: whipTop + 0.014,
		maxTilt_rad: 0.3,
		dispose: kit.dispose,
	};
}

// ---------------------------------------------------------------- 3 m discus

export function buildDiscus(station = "46042", colors: BuoyColors = DEFAULT_BUOY_COLORS): BuoyModel {
	const kit = createPartKit(colors.ink);
	const m = materials(kit, colors);
	const group = new Group();
	const R = DISCUS_DIAMETER_M / 2;
	const deckY = 0.45;

	// Hull: a lathed disc with a chamfered bilge and a crowned deck.
	const profile = [
		new Vector2(0.001, -0.55),
		new Vector2(1.15, -0.55),
		new Vector2(R, -0.28),
		new Vector2(R, deckY - 0.08),
		new Vector2(R - 0.07, deckY),
		new Vector2(0.9, deckY + 0.03),
		new Vector2(0.001, deckY + 0.05),
	];
	kit.add(group, new LatheGeometry(profile, 64), m.hull, [0, 0, 0], { outline: BUOY_OUTLINE_M }).userData.kind = "hull";
	// Rub rail around the deck edge.
	const rail = new TorusGeometry(R + 0.01, 0.055, 12, 72);
	rail.rotateX(Math.PI / 2);
	kit.add(group, rail, m.rubber, [0, deckY - 0.06, 0], { outline: 0 });
	// Station number and NOAA on opposite sides of the hull, in the band above the waterline.
	hullLettering(kit, group, station, R + 0.005, Math.PI / 2, 0.19, 0.2, m.ink);
	hullLettering(kit, group, "NOAA", R + 0.005, -Math.PI / 2, 0.19, 0.2, m.ink);

	// Three bolted electronics-well hatches on the deck, between the tower legs.
	const legAz = [0, 1, 2].map((i) => Math.PI / 2 + (i * 2 * Math.PI) / 3);
	for (const az of legAz) {
		const hz = az + Math.PI / 3;
		const hx = Math.cos(hz) * 0.95;
		const hzz = Math.sin(hz) * 0.95;
		const hatch = new Group();
		hatch.position.set(hx, deckY + 0.025, hzz);
		kit.add(hatch, new CylinderGeometry(0.24, 0.25, 0.04, 32), m.steel, [0, 0.02, 0], { outline: BUOY_OUTLINE_SMALL_M });
		boltRing(kit, hatch, 10, 0.21, 0.045, m.ink, 0.014);
		group.add(hatch);
	}

	// Tripod tower: three aluminum legs from the deck to an apex, with ring braces and diagonals.
	const baseR = 0.78;
	const apexY = 4.2;
	const apexR = 0.12;
	const legAt = (az: number, y: number) => {
		const f = (y - deckY) / (apexY - deckY);
		const r = baseR + (apexR - baseR) * f;
		return new Vector3(Math.cos(az) * r, y, Math.sin(az) * r);
	};
	for (const az of legAz) {
		bar(kit, group, legAt(az, deckY + 0.02), legAt(az, apexY), 0.045, m.steel, BUOY_OUTLINE_SMALL_M).userData.kind = "tower";
		// Foot plate where the leg meets the deck.
		const foot = legAt(az, deckY + 0.03);
		kit.add(group, slab(0.2, 0.04, 0.2, 0.02, 0.006), m.steel, [foot.x, foot.y, foot.z], { rot: [0, -az, 0], outline: 0 });
	}
	const levels = [1.35, 2.45, 3.4, apexY - 0.05];
	for (let li = 0; li < levels.length; li++) {
		for (let i = 0; i < 3; i++) {
			const a = legAz[i];
			const b = legAz[(i + 1) % 3];
			bar(kit, group, legAt(a, levels[li]), legAt(b, levels[li]), 0.022, m.steel).userData.kind = "tower";
			// Zig-zag diagonals up each face.
			const below = li === 0 ? deckY + 0.05 : levels[li - 1];
			bar(kit, group, legAt(li % 2 ? a : b, below), legAt(li % 2 ? b : a, levels[li]), 0.016, m.steel).userData.kind = "tower";
		}
	}

	// Solar panels on the three tower faces, leaning with the faces.
	const panelY = (levels[0] + levels[1]) / 2;
	for (let i = 0; i < 3; i++) {
		const a = legAz[i];
		const b = legAz[(i + 1) % 3];
		const mid = legAt(a, panelY).add(legAt(b, panelY)).multiplyScalar(0.5);
		const out = new Vector3(mid.x, 0, mid.z).normalize();
		const faceAz = Math.atan2(out.z, out.x);
		// The middle of a face sits at half a leg's radius, so it leans in half as far as a leg does.
		const lean = Math.atan2((baseR - apexR) / 2, apexY - deckY);
		const pos = mid.clone().addScaledVector(out, 0.07);
		const panel = new Group();
		panel.position.copy(pos);
		panel.rotation.set(0, Math.PI / 2 - faceAz, 0);
		// In the panel's frame +Z points out of the tower; lean the top inward.
		const tilt = new Group();
		tilt.rotation.x = -lean;
		panel.add(tilt);
		kit.add(tilt, slab(0.78, 0.95, 0.035, 0.02, 0.006), m.steel, [0, 0, 0], { outline: BUOY_OUTLINE_SMALL_M });
		kit.add(tilt, slab(0.72, 0.89, 0.03, 0.01, 0.004), m.panel, [0, 0, 0.012], { outline: 0 }).userData.kind = "solar";
		// Cell gridlines.
		for (const u of [-0.24, 0, 0.24]) kit.add(tilt, slab(0.008, 0.87, 0.004, 0.002, 0.001), m.steel, [u, 0, 0.03], { outline: 0 });
		for (const v of [-0.22, 0.22]) kit.add(tilt, slab(0.7, 0.008, 0.004, 0.002, 0.001), m.steel, [0, v, 0.03], { outline: 0 });
		group.add(panel);
	}

	// Air temperature and humidity sensor in its stacked-plate radiation shield, on one leg.
	const white = kit.std("#f4f4f0", 0.55);
	{
		const p = legAt(legAz[1], 3.75);
		const out = new Vector3(p.x, 0, p.z).normalize();
		const c = p.clone().addScaledVector(out, 0.2);
		bar(kit, group, p, c, 0.015, m.steel);
		for (let k = 0; k < 6; k++) {
			kit.add(group, new CylinderGeometry(0.08, 0.09, 0.018, 16), white, [c.x, c.y - 0.12 + k * 0.04, c.z], { outline: 0 });
		}
	}

	// Top: a platform plate, a short mast, a cross-arm with an anemometer at each end, the lantern
	// and antennas.
	kit.add(group, new CylinderGeometry(0.2, 0.2, 0.04, 24), m.steel, [0, apexY + 0.02, 0], { outline: BUOY_OUTLINE_SMALL_M });
	const armY = DISCUS_ANEMOMETER_HEIGHT_M - 0.22;
	kit.add(group, new CylinderGeometry(0.035, 0.04, armY - apexY, 10), m.steel, [0, (apexY + armY) / 2, 0], { outline: 0 });
	const armHalf = 0.7;
	kit.add(group, slab(armHalf * 2, 0.05, 0.05, 0.01, 0.004), m.steel, [0, armY, 0], { outline: BUOY_OUTLINE_SMALL_M });
	for (const s of [-1, 1]) {
		const x = s * armHalf;
		kit.add(group, new CylinderGeometry(0.018, 0.018, 0.2, 8), m.steel, [x, armY + 0.1, 0], { outline: 0 });
		// Propeller-vane anemometer: body along X, propeller at the nose, fin at the tail.
		const vane = new Group();
		vane.position.set(x, DISCUS_ANEMOMETER_HEIGHT_M, 0);
		vane.rotation.y = s > 0 ? 0.4 : -0.3;
		vane.userData.kind = "anemometer";
		const body = new CylinderGeometry(0.035, 0.03, 0.42, 12);
		body.rotateZ(Math.PI / 2);
		kit.add(vane, body, m.ink, [0, 0, 0], { outline: 0 });
		const nose = new CylinderGeometry(0.0, 0.03, 0.06, 12);
		nose.rotateZ(-Math.PI / 2);
		kit.add(vane, nose, m.ink, [0.24, 0, 0], { outline: 0 });
		for (const r of [0, Math.PI / 2]) {
			kit.add(vane, slab(0.01, 0.26, 0.035, 0.004, 0.002), m.ink, [0.24, 0, 0], { rot: [r, 0, 0], outline: 0 });
		}
		kit.add(vane, slab(0.16, 0.13, 0.008, 0.02, 0.002), m.ink, [-0.24, 0.02, 0], { outline: 0 });
		group.add(vane);
	}
	// Lantern on the mast head, between the anemometers.
	const lensBase = armY + 0.05;
	kit.add(group, new CylinderGeometry(0.08, 0.08, 0.025, 20), m.ink, [0, lensBase, 0], { outline: 0 });
	kit.add(group, new CylinderGeometry(0.07, 0.07, 0.15, 20), m.lens, [0, lensBase + 0.0125 + 0.075, 0], { outline: BUOY_OUTLINE_SMALL_M }).userData.kind =
		"lantern";
	const capY = lensBase + 0.0125 + 0.15;
	kit.add(group, new CylinderGeometry(0.05, 0.08, 0.035, 20), m.ink, [0, capY + 0.0175, 0], { outline: 0 });
	// Satellite whips from the arm, and a GPS puck on the platform.
	let height = DISCUS_ANEMOMETER_HEIGHT_M + 0.13;
	for (const x of [-0.38, 0.38]) {
		const top = armY + 0.75;
		kit.add(group, new CylinderGeometry(0.006, 0.01, top - armY, 6), m.ink, [x, (armY + top) / 2, 0], { outline: 0 }).userData.kind = "antenna";
		kit.add(group, new SphereGeometry(0.015, 8, 6), m.ink, [x, top, 0], { outline: 0 });
		height = Math.max(height, top + 0.015);
	}
	const puck = new SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
	kit.add(group, puck, white, [0.12, apexY + 0.04, -0.06], { outline: 0 });

	return {
		instrument: "discus",
		group,
		parts: kit.parts,
		lantern: m.lens,
		diameter_m: DISCUS_DIAMETER_M,
		height_m: height,
		maxTilt_rad: Math.asin((deckY / 3) / R),
		dispose: kit.dispose,
	};
}

export function buildBuoy(instrument: Instrument, station: string, colors: BuoyColors = DEFAULT_BUOY_COLORS): BuoyModel {
	return instrument === "discus" ? buildDiscus(station, colors) : buildWaverider(colors);
}

/** Every mesh tagged `kind`, directly or through its parent group. */
export function partsOfKind(model: BuoyModel, kind: string): Mesh[] {
	const out: Mesh[] = [];
	model.group.traverse((o) => {
		if (o instanceof Mesh && (o.userData.kind === kind || o.parent?.userData.kind === kind)) out.push(o);
	});
	return out;
}
