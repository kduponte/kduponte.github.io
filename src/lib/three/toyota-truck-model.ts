import {
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	LatheGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Shape,
	TorusGeometry,
	Vector2,
	type Material,
	type Object3D,
} from "three";
import { OUTLINE, OUTLINE_SMALL, createPartKit, extrude, shade, slab, tint } from "./kit";

/**
 * A stylized ~1991 Toyota regular-cab long-bed pickup (4th-gen Hilux), modeled in meters from
 * reference photos: 2.95 m wheelbase, ~4.85 m long, ~1.6 m tall, 14-inch steel wheels.
 * Sloped hood, flared round arches, slatted grille between rectangular headlights, wide plastic
 * bumper with corner signals, a transparent greenhouse showing a bench seat and wheel, and a
 * genuinely hollow bed with a recessed floor, wheel wells, and a tailgate.
 * Front of the truck points toward +X, up is +Y, and the right-hand side is +Z.
 */

export interface TruckColors {
	body: string;
	trim: string;
	glass: string;
	/** Wheel center cap accent. */
	hub: string;
	/** Headlight lenses. */
	light: string;
	/** Painted grille surround and headlight bezels (the 1989-91 US base grille is painted, not chromed). */
	bumper: string;
	/** Rim steel, chrome bumpers and the grille letters. */
	silver: string;
	amber: string;
	tail: string;
	/** Seats and dashboard. */
	interior: string;
}

export const DEFAULT_TRUCK_COLORS: TruckColors = {
	body: "#c4262e",
	trim: "#111111",
	glass: "#bfe6ff",
	hub: "#c8ff3d",
	light: "#fff4c7",
	bumper: "#3a3d40",
	silver: "#dfe3e6",
	amber: "#ff9f1c",
	tail: "#d62828",
	interior: "#6b7076",
};

export interface TruckModel {
	group: Group;
	/** Wheel pivots, spin them about their local Z axis. */
	wheels: Group[];
	/** Every mesh that makes up the visible truck (excludes outline shells and the shadow). */
	parts: Mesh[];
	/** Materials with emissive channels, for flashing the lights. */
	lights: { head: MeshStandardMaterial; tail: MeshStandardMaterial };
	dispose: () => void;
}

// Layout constants, in meters.
const WHEEL_R = 0.33;
const AXLE_Y = 0.33;
const FRONT_AXLE_X = 1.35;
const REAR_AXLE_X = -1.6;
const ARCH_RX = 0.43; // wheel arch half-width
const ARCH_RY = 0.41; // wheel arch height above the axle
const ARCH_SQUARENESS = 2.7; // superellipse exponent: 2 is a semicircle, higher is squarer
const BODY_HALF_W = 0.82;
const BELT_Y = 0.98;
const NOSE_X = 2.18;
const CAB_BACK_X = -0.62;
const CAB_FRONT_X = 0.7; // cowl / firewall
const CAB_FLOOR_Y = 0.5;
const TAIL_X = -2.64;
const BED_FLOOR_Y = 0.665;
/** Width of the hood's raised center section. */
const HOOD_BULGE_W = 0.74;

/**
 * The front end, from photos of 1989-91 US-market pickups. The headlights are 7x6-inch rectangular
 * sealed beams (H6054: 200 x 142 mm); everything else is sized relative to them and the 1.64 m body.
 */
/** The tailgate's indented panel, meters: between the tail lamps, from just under the latch to near the bottom. */
const GATE_PANEL = { top: 0.875, bottom: 0.56, halfW: 0.63 } as const;

/** Tail lamp, per section, meters: as tall as the bed corner from just above the bumper, in photos of 1989-91 trucks. */
const TAIL_LAMP = { top: 0.88, amber: 0.07, clear: 0.05, red: 0.21, w: 0.1 } as const;

const FRONT = {
	bandY: 0.78, // center of the lamp-and-grille band
	bandH: 0.17,
	grilleHalfW: 0.42,
	headW: 0.2,
	headH: 0.142,
	headZ: 0.55,
	// Corner lamp, US pattern: the line between its clear and amber sections rakes outward toward the
	// bottom (the Japanese Hilux's leans the other way), and the amber wraps round onto the fender.
	cornerTopW: 0.12,
	cornerBotW: 0.15,
	cornerWrapTop: 0.05,
	cornerWrapBot: 0.09,
	bumperY: 0.58,
	bumperH: 0.16,
	valanceY: 0.44,
	valanceH: 0.12,
	turnZ: 0.66,
} as const;

/**
 * Points along a squared-off wheel arch (the upper half of a superellipse), from the right foot
 * over the top to the left foot. The 4th-gen pickup's arches are rounder than a box but flatter
 * on top than a circle.
 */
function archPoints(cx: number, cy: number, rx: number, ry: number, segments = 28): Vector2[] {
	const e = 2 / ARCH_SQUARENESS;
	const pts: Vector2[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = (i / segments) * Math.PI;
		const c = Math.cos(t);
		pts.push(new Vector2(cx + rx * Math.sign(c) * Math.abs(c) ** e, cy + ry * Math.sin(t) ** e));
	}
	return pts;
}

/** Continue a profile path over a wheel arch centered at `cx`. */
function archTo(s: Shape, cx: number) {
	for (const p of archPoints(cx, AXLE_Y, ARCH_RX, ARCH_RY)) s.lineTo(p.x, p.y);
}

/** Side profile of the front clip (hood and fenders), with the front wheel arch cut out. */
function frontClipProfile(): Shape {
	const s = new Shape();
	s.moveTo(NOSE_X, AXLE_Y);
	archTo(s, FRONT_AXLE_X);
	s.lineTo(CAB_FRONT_X, AXLE_Y);
	s.lineTo(CAB_FRONT_X, BELT_Y);
	s.lineTo(NOSE_X, 0.9); // hood slopes down to the nose
	s.lineTo(NOSE_X, AXLE_Y);
	return s;
}

/** Side profile of one bed wall, with the rear wheel arch cut out. */
function bedWallProfile(): Shape {
	const s = new Shape();
	s.moveTo(CAB_BACK_X, AXLE_Y);
	archTo(s, REAR_AXLE_X);
	s.lineTo(TAIL_X, AXLE_Y);
	s.lineTo(TAIL_X, BELT_Y);
	s.lineTo(CAB_BACK_X, BELT_Y);
	s.lineTo(CAB_BACK_X, AXLE_Y);
	return s;
}

/** Fills a wheel arch so it reads dark from the side. Local origin at the axle. */
function archFill(): Shape {
	return new Shape(archPoints(0, 0, ARCH_RX - 0.02, ARCH_RY - 0.02));
}

/** The flared lip around an arch: a band between two arch outlines. Local origin at the axle. */
function archLip(width: number): Shape {
	const outer = archPoints(0, 0, ARCH_RX + width, ARCH_RY + width);
	const inner = archPoints(0, 0, ARCH_RX - 0.005, ARCH_RY - 0.005).reverse();
	return new Shape([...outer, ...inner]);
}

/**
 * Raised block lettering, as stroke segments on a cell 0.75 wide and 1 tall. Only the letters
 * in TOYOTA are needed.
 */
const GLYPHS: Record<string, [number, number, number, number][]> = {
	T: [
		[0, 1, 0.75, 1],
		[0.375, 1, 0.375, 0],
	],
	O: [
		[0, 0, 0.75, 0],
		[0.75, 0, 0.75, 1],
		[0.75, 1, 0, 1],
		[0, 1, 0, 0],
	],
	Y: [
		[0, 1, 0.375, 0.5],
		[0.75, 1, 0.375, 0.5],
		[0.375, 0.5, 0.375, 0],
	],
	A: [
		[0, 0, 0.375, 1],
		[0.75, 0, 0.375, 1],
		[0.17, 0.36, 0.58, 0.36],
	],
};

export function buildToyotaTruck(colors: TruckColors = DEFAULT_TRUCK_COLORS): TruckModel {
	const kit = createPartKit(colors.trim);
	const { add, std } = kit;
	const bodyMat = std(colors.body, 0.36, 0.35);
	const bedFloorMat = std(shade(colors.body, 0.45), 0.5, 0.2);
	const creaseMat = std(tint(colors.body, 0.22), 0.3, 0.35);
	const trimMat = std(colors.trim, 0.8);
	const grilleMat = std(colors.bumper, 0.6);
	const chromeMat = std(tint(colors.silver, 0.3), 0.16, 0.9);
	const dishMat = std(shade(colors.silver, 0.35), 0.5, 0.6);
	const silverMat = std(colors.silver, 0.28, 0.85);
	const hubMat = std(colors.hub, 0.5);
	const amberMat = std(colors.amber, 0.4);
	// Interior shades all derive from the one interior color (gray cloth in the reference truck).
	const interiorMat = std(colors.interior, 0.85);
	const seatMat = std(tint(colors.interior, 0.12), 0.95);
	const carpetMat = std(shade(colors.interior, 0.45), 1);
	const dashMat = std(shade(colors.interior, 0.35), 0.75);
	const headlinerMat = std(tint(colors.interior, 0.5), 0.95);
	const headMat = std(colors.light, 0.2);
	headMat.emissive = new Color(colors.light);
	headMat.emissiveIntensity = 0;
	const clearLensMat = std("#f4f1ea", 0.2);
	// TOYOTA is painted on in white, inside the tailgate's indent, which sits a shade darker in shadow.
	const letterPaintMat = std("#f4f2ec", 0.5);
	const recessMat = std(shade(colors.body, 0.14), 0.4, 0.3);
	const tailMat = std(colors.tail, 0.35);
	tailMat.emissive = new Color(colors.tail);
	tailMat.emissiveIntensity = 0;
	const glassMat = kit.material(
		new MeshStandardMaterial({
		color: colors.glass,
		roughness: 0.05,
		metalness: 0.1,
		transparent: true,
		opacity: 0.26,
		depthWrite: false,
		}),
	);

	const group = new Group();
	/** Both sides of the truck: mirrors Z. */
	const pair = (fn: (side: 1 | -1) => void) => {
		fn(1);
		fn(-1);
	};
	/**
	 * Raised block lettering on a face perpendicular to X, centered on `center`. `facing` is the
	 * direction the face points (+1 front, -1 rear), which decides which way along Z reads left to right.
	 */
	const lettering = (text: string, center: [number, number, number], height: number, stroke: number, facing: 1 | -1, mat: Material) => {
		const cellW = 0.75 * height;
		const gap = 0.32 * height;
		const total = text.length * cellW + (text.length - 1) * gap;
		const dir = -facing; // seen from behind, the reader's right is +Z; from the front, -Z
		[...text].forEach((ch, i) => {
			const left = -total / 2 + i * (cellW + gap);
			for (const [u0, v0, u1, v1] of GLYPHS[ch]) {
				const du = (u1 - u0) * height;
				const dv = (v1 - v0) * height;
				const u = left + ((u0 + u1) / 2) * height;
				const v = ((v0 + v1) / 2 - 0.5) * height;
				const angle = Math.atan2(dv, dir * du);
				add(group, slab(0.02, stroke, Math.hypot(du, dv) + stroke, stroke * 0.3, 0.004), mat, [center[0], center[1] + v, center[2] + dir * u], {
					rot: [-angle, 0, 0],
					outline: 0,
				});
			}
		});
	};

	/**
	 * The hood isn't flat: its center section stands proud of the rest, with sloped sides that run from
	 * the cowl toward the nose. Built as a trapezoid cross-section swept along the hood's slope, placed
	 * relative to (ox, oy) so an opening hood can carry it on its hinge.
	 */
	function hoodDetail(parent: Object3D, ox: number, oy: number) {
		const x0 = CAB_FRONT_X + 0.08;
		const x1 = NOSE_X - 0.12;
		const topAt = (x: number) => BELT_Y + ((x - CAB_FRONT_X) / (NOSE_X - CAB_FRONT_X)) * (0.9 - BELT_Y);
		const rise = 0.03;
		const section = new Shape(
			[
				[-HOOD_BULGE_W / 2, 0],
				[HOOD_BULGE_W / 2, 0],
				[HOOD_BULGE_W / 2 - 0.08, rise],
				[-HOOD_BULGE_W / 2 + 0.08, rise],
			].map(([u, v]) => new Vector2(u, v)),
		);
		const geo = extrude(section, x1 - x0, 0.02, true);
		geo.rotateY(Math.PI / 2); // sweep along X
		geo.rotateZ(Math.atan2(0.9 - BELT_Y, NOSE_X - CAB_FRONT_X)); // follow the hood's fall toward the nose
		const mid = (x0 + x1) / 2;
		add(parent, geo, bodyMat, [mid - ox, topAt(mid) + rise / 2 - 0.006 - oy, 0], { outline: OUTLINE_SMALL });
	}

	// --- Front clip: hood and fenders ---
	add(group, extrude(frontClipProfile(), BODY_HALF_W * 2, 0.07, false), bodyMat, [0, 0, 0], { outline: OUTLINE });
	hoodDetail(group, 0, 0);

	// --- Cab shell: floor pan, door walls and back wall, hollow so the interior shows through the glass ---
	const cabLen = CAB_FRONT_X - CAB_BACK_X;
	const cabMidX = (CAB_FRONT_X + CAB_BACK_X) / 2;
	const cabInnerW = BODY_HALF_W * 2 - 0.18;
	add(group, slab(cabLen, CAB_FLOOR_Y - AXLE_Y, BODY_HALF_W * 2 - 0.1, 0.02, 0.01), trimMat, [cabMidX, (AXLE_Y + CAB_FLOOR_Y) / 2, 0], {
		outline: 0,
	});
	pair((side) => {
		add(group, slab(cabLen, BELT_Y - AXLE_Y, 0.08, 0.03, 0.02), bodyMat, [cabMidX, (AXLE_Y + BELT_Y) / 2, side * (BODY_HALF_W - 0.04)], {
			outline: OUTLINE,
		});
		// Black belt molding along the window sill.
		add(group, slab(cabLen, 0.025, 0.1, 0.01, 0.006), trimMat, [cabMidX, BELT_Y + 0.005, side * (BODY_HALF_W - 0.04)], { outline: 0 });
	});
	add(group, slab(0.06, BELT_Y - CAB_FLOOR_Y, BODY_HALF_W * 2 - 0.1, 0.02, 0.01), bodyMat, [CAB_BACK_X + 0.03, (CAB_FLOOR_Y + BELT_Y) / 2, 0]);
	// Dark wheel well behind the front wheels.
	add(group, extrude(archFill(), BODY_HALF_W * 2 - 0.2, 0, false), trimMat, [FRONT_AXLE_X, AXLE_Y, 0], { outline: 0 });

	pair((side) => {
		const skin = side * (BODY_HALF_W + 0.004);
		// The body-side crease that runs from the front fender, through the door, along the bed.
		const creaseFrom = TAIL_X + 0.04;
		const creaseTo = NOSE_X - 0.08;
		const creaseMid = (creaseFrom + creaseTo) / 2;
		// A lit upper edge over a dark shadow line, like light catching a stamped crease.
		add(group, slab(creaseTo - creaseFrom, 0.022, 0.014, 0.008, 0.005), creaseMat, [creaseMid, 0.805, skin], { outline: 0 });
		add(group, slab(creaseTo - creaseFrom, 0.012, 0.008, 0.004, 0.002), trimMat, [creaseMid, 0.788, skin - side * 0.002], {
			outline: 0,
		});
		// Seam between the cab and the bed.
		add(group, slab(0.02, BELT_Y - AXLE_Y, 0.02, 0.006, 0.003), trimMat, [CAB_BACK_X - 0.005, (AXLE_Y + BELT_Y) / 2, side * (BODY_HALF_W + 0.008)], {
			outline: 0,
		});
	});
	// Fuel door on the driver's side of the bed, ahead of the rear wheel.
	add(group, slab(0.15, 0.15, 0.012, 0.035, 0.004), bodyMat, [CAB_BACK_X - 0.3, 0.62, -(BODY_HALF_W + 0.004)], { outline: 0.008 });

	// --- Bed: hollow, built from walls, a recessed floor, wheel wells, headboard and tailgate ---
	const bedLen = CAB_BACK_X - TAIL_X;
	const bedMidX = (TAIL_X + CAB_BACK_X) / 2;
	pair((side) => {
		add(group, extrude(bedWallProfile(), 0.08, 0.02, false), bodyMat, [0, 0, side * (BODY_HALF_W - 0.04)], {
			outline: OUTLINE,
		});
		// Rolled top rail along the wall, with stake pockets at the corners and over the wheel.
		add(group, slab(bedLen, 0.05, 0.12, 0.02, 0.012), bodyMat, [bedMidX, BELT_Y, side * (BODY_HALF_W - 0.06)]);
		for (const x of [CAB_BACK_X - 0.14, REAR_AXLE_X, TAIL_X + 0.14]) {
			add(group, slab(0.07, 0.012, 0.04, 0.008, 0.003), trimMat, [x, BELT_Y + 0.026, side * (BODY_HALF_W - 0.06)], { outline: 0 });
		}
		// Wheel well intruding into the bed.
		add(group, slab(0.95, 0.24, 0.22, 0.1, 0.03), bodyMat, [REAR_AXLE_X, BED_FLOOR_Y + 0.12, side * (BODY_HALF_W - 0.2)]);
		// Inside the wall: stamped vertical ribs and tie-down hooks under the rail.
		const innerZ = side * (BODY_HALF_W - 0.086);
		for (const x of [CAB_BACK_X - 0.32, CAB_BACK_X - 0.44, TAIL_X + 0.3, TAIL_X + 0.42]) {
			add(group, slab(0.04, 0.2, 0.012, 0.012, 0.004), bodyMat, [x, BED_FLOOR_Y + 0.15, innerZ], { outline: 0.008 });
		}
		for (const x of [CAB_BACK_X - 0.2, TAIL_X + 0.2]) {
			add(group, new TorusGeometry(0.03, 0.007, 6, 12, Math.PI), silverMat, [x, BELT_Y - 0.1, innerZ - side * 0.01], { outline: 0 });
		}
	});
	// Dark underbody so the gap below the floor reads as frame, not sky.
	add(group, slab(bedLen, 0.3, BODY_HALF_W * 2 - 0.2, 0.02, 0.01), trimMat, [bedMidX, AXLE_Y + 0.15, 0], { outline: 0 });
	// Floor, sitting well below the rails, with stamped ribs.
	add(group, slab(bedLen - 0.08, 0.05, BODY_HALF_W * 2 - 0.16, 0.01, 0.006), bedFloorMat, [bedMidX, BED_FLOOR_Y - 0.025, 0], {
		outline: 0.02,
	});
	for (let i = 0; i < 8; i++) {
		add(group, slab(0.045, 0.025, BODY_HALF_W * 2 - 0.2, 0.008, 0.004), bedFloorMat, [CAB_BACK_X - 0.2 - i * 0.24, BED_FLOOR_Y + 0.008, 0], {
			outline: 0,
		});
	}
	// Bed front wall at rail height, so the rear window stays clear: rolled cap and stamped ribs.
	const bedInnerW = BODY_HALF_W * 2 - 0.1;
	add(group, slab(0.07, BELT_Y - BED_FLOOR_Y + 0.02, bedInnerW, 0.02, 0.015), bodyMat, [CAB_BACK_X - 0.05, (BED_FLOOR_Y + BELT_Y) / 2, 0]);
	add(group, slab(0.12, 0.05, bedInnerW, 0.02, 0.012), bodyMat, [CAB_BACK_X - 0.06, BELT_Y, 0]);
	for (const y of [BED_FLOOR_Y + 0.09, BED_FLOOR_Y + 0.19]) {
		add(group, slab(0.015, 0.035, bedInnerW - 0.24, 0.01, 0.004), bodyMat, [CAB_BACK_X - 0.09, y, 0], { outline: 0.008 });
	}

	// Tailgate, flush with the walls, as on 1989-91 US trucks: ribbed inside; outside, a chrome latch
	// handle in a recessed pocket at the top center, and below it a wide indented panel with TOYOTA
	// painted across it in white (not stamped, not separate chrome letters).
	add(group, slab(0.07, 0.5, BODY_HALF_W * 2 - 0.08, 0.02, 0.015), bodyMat, [TAIL_X + 0.03, 0.75, 0], { outline: OUTLINE });
	for (const y of [0.62, 0.74, 0.86]) {
		add(group, slab(0.012, 0.03, BODY_HALF_W * 2 - 0.3, 0.01, 0.004), bodyMat, [TAIL_X + 0.071, y, 0], { outline: 0.008 });
	}
	const gateFace = TAIL_X - 0.005;
	// The indent: a shadowed panel ringed by a raised lip, so it reads as pressed in.
	const pan = GATE_PANEL;
	add(group, slab(0.004, pan.top - pan.bottom, pan.halfW * 2, 0.02, 0.001), recessMat, [gateFace - 0.001, (pan.top + pan.bottom) / 2, 0], { outline: 0 });
	for (const y of [pan.top, pan.bottom]) {
		add(group, slab(0.012, 0.016, pan.halfW * 2 + 0.016, 0.006, 0.003), bodyMat, [gateFace - 0.004, y, 0], { outline: 0.006 });
	}
	pair((side) => add(group, slab(0.012, pan.top - pan.bottom, 0.016, 0.006, 0.003), bodyMat, [gateFace - 0.004, (pan.top + pan.bottom) / 2, side * pan.halfW], { outline: 0.006 }));
	lettering("TOYOTA", [gateFace - 0.002, 0.7, 0], 0.11, 0.024, -1, letterPaintMat);
	add(group, slab(0.006, 0.07, 0.22, 0.02, 0.003), trimMat, [gateFace - 0.001, 0.94, 0], { outline: 0 }); // handle pocket
	add(group, slab(0.022, 0.032, 0.17, 0.012, 0.006), chromeMat, [gateFace - 0.008, 0.94, 0], { outline: 0.008 }); // latch handle

	// --- Flared lips on every wheel opening ---
	pair((side) => {
		for (const x of [FRONT_AXLE_X, REAR_AXLE_X]) {
			add(group, extrude(archLip(0.035), 0.04, 0.008, false), trimMat, [x, AXLE_Y, side * (BODY_HALF_W + 0.012)], { outline: 0 });
		}
	});

	// --- Cab greenhouse: transparent glass with an interior you can see through it ---
	const glassShape = new Shape();
	glassShape.moveTo(0.72, BELT_Y);
	glassShape.lineTo(0.12, 1.58);
	glassShape.lineTo(-0.5, 1.58);
	glassShape.lineTo(-0.6, BELT_Y);
	add(group, extrude(glassShape, 1.5, 0.02, false), glassMat, [0, 0, 0], { outline: 0 });
	// Roof, slightly proud of the glass.
	add(group, slab(0.8, 0.06, 1.62, 0.03, 0.02), bodyMat, [-0.19, 1.6, 0], { outline: OUTLINE });
	// Sliding rear window: black frame along the raked rear glass, slider rails and a center latch.
	const rearRake = -0.165;
	const rearGlassX = (y: number) => -0.6 + ((y - BELT_Y) / (1.58 - BELT_Y)) * 0.1 - 0.012;
	add(group, slab(0.025, 0.025, 1.42, 0.008, 0.004), trimMat, [rearGlassX(BELT_Y + 0.03), BELT_Y + 0.03, 0], { outline: 0 });
	add(group, slab(0.025, 0.025, 1.42, 0.008, 0.004), trimMat, [rearGlassX(1.55), 1.55, 0], { outline: 0 });
	for (const z of [-0.26, 0.26]) {
		add(group, slab(0.025, 0.55, 0.025, 0.008, 0.004), trimMat, [rearGlassX(1.29), 1.29, z], { rot: [0, 0, rearRake], outline: 0 });
	}
	add(group, slab(0.02, 0.05, 0.05, 0.01, 0.004), silverMat, [rearGlassX(1.29) - 0.005, 1.29, 0], { rot: [0, 0, rearRake], outline: 0 });

	pair((side) => {
		// A pillar follows the windshield rake; C pillar leans back with the rear window.
		add(group, slab(Math.hypot(0.6, 0.6), 0.07, 0.07, 0.02, 0.01), bodyMat, [0.42, (BELT_Y + 1.58) / 2, side * 0.77], {
			rot: [0, 0, (3 * Math.PI) / 4],
		});
		add(group, slab(0.09, 0.62, 0.07, 0.02, 0.01), bodyMat, [-0.55, (BELT_Y + 1.58) / 2, side * 0.77], { rot: [0, 0, -0.165] });
		// Door window frame divider.
		add(group, slab(0.045, 0.6, 0.05, 0.015, 0.008), bodyMat, [-0.2, (BELT_Y + 1.58) / 2, side * 0.77], { outline: 0.02 });
		// Door seams and handle.
		for (const x of [0.62, -0.5]) {
			add(group, slab(0.022, 0.52, 0.02, 0.008, 0.004), trimMat, [x, 0.7, side * (BODY_HALF_W + 0.012)], { outline: 0 });
		}
		add(group, slab(0.14, 0.04, 0.04, 0.015, 0.008), trimMat, [-0.34, 0.9, side * (BODY_HALF_W + 0.025)], { outline: 0 });
		// Mirror on a stalk.
		add(group, slab(0.06, 0.05, 0.16, 0.02, 0.008), trimMat, [0.74, 1.14, side * 0.89], { outline: 0 });
		add(group, slab(0.07, 0.24, 0.12, 0.03, 0.012), trimMat, [0.74, 1.24, side * 0.99], { outline: 0.02 });
	});

	// --- Interior. The driver sits on the left (-Z), US market. ---
	const inner = { outline: 0 };
	// Carpet, kick panel at the firewall, and trim on the inside of the back wall.
	add(group, slab(cabLen - 0.1, 0.03, cabInnerW, 0.01, 0.005), carpetMat, [cabMidX, CAB_FLOOR_Y + 0.015, 0], inner);
	add(group, slab(0.04, BELT_Y - CAB_FLOOR_Y, cabInnerW, 0.01, 0.005), carpetMat, [CAB_FRONT_X - 0.03, (CAB_FLOOR_Y + BELT_Y) / 2, 0], inner);
	add(group, slab(0.02, BELT_Y - CAB_FLOOR_Y - 0.04, cabInnerW, 0.01, 0.005), interiorMat, [CAB_BACK_X + 0.07, (CAB_FLOOR_Y + BELT_Y) / 2, 0], inner);
	pair((side) => {
		// Door panel with an armrest and an inside handle.
		const panelZ = side * (BODY_HALF_W - 0.09);
		add(group, slab(cabLen - 0.12, BELT_Y - CAB_FLOOR_Y - 0.04, 0.02, 0.02, 0.008), interiorMat, [cabMidX, (CAB_FLOOR_Y + BELT_Y) / 2, panelZ], inner);
		add(group, slab(0.34, 0.05, 0.07, 0.02, 0.01), dashMat, [0.02, 0.8, side * (BODY_HALF_W - 0.13)], inner);
		add(group, slab(0.08, 0.025, 0.02, 0.008, 0.004), silverMat, [0.42, 0.9, side * (BODY_HALF_W - 0.105)], inner);
		// Sun visors, folded up against the headliner.
		add(group, slab(0.16, 0.02, 0.5, 0.02, 0.008), headlinerMat, [0.06, 1.535, side * 0.38], { rot: [0, 0, 0.08], outline: 0 });
	});

	// Dash: main slab, instrument hood with a gauge face over the steering wheel, vents, glovebox seam.
	add(group, slab(0.36, 0.16, cabInnerW, 0.05, 0.02), dashMat, [0.5, BELT_Y - 0.01, 0], inner);
	add(group, slab(0.14, 0.08, 0.5, 0.03, 0.012), trimMat, [0.44, BELT_Y + 0.1, -0.38], inner);
	add(group, slab(0.01, 0.055, 0.4, 0.02, 0.004), headlinerMat, [0.37, BELT_Y + 0.08, -0.38], inner);
	for (const z of [-0.06, 0.06]) {
		add(group, slab(0.01, 0.05, 0.09, 0.012, 0.004), trimMat, [0.315, BELT_Y + 0.02, z], inner);
	}
	add(group, slab(0.01, 0.012, 0.36, 0.004, 0.002), trimMat, [0.315, BELT_Y - 0.05, 0.38], inner);

	// Bench seat: cushion, reclined back with stitched pleats, and two headrests.
	add(group, slab(0.5, 0.15, cabInnerW - 0.06, 0.06, 0.03), seatMat, [-0.15, CAB_FLOOR_Y + 0.21, 0], inner);
	const seatBack = new Group();
	seatBack.position.set(-0.38, 0.97, 0);
	seatBack.rotation.z = 0.17; // reclined
	add(seatBack, slab(0.16, 0.56, cabInnerW - 0.06, 0.06, 0.03), seatMat, [0, 0, 0], inner);
	for (const y of [-0.12, 0.04, 0.2]) {
		add(seatBack, slab(0.01, 0.012, cabInnerW - 0.12, 0.004, 0.002), interiorMat, [0.081, y, 0], inner);
	}
	pair((side) => {
		add(seatBack, slab(0.1, 0.15, 0.3, 0.05, 0.02), seatMat, [-0.03, 0.34, side * 0.37], inner);
	});
	group.add(seatBack);

	// Floor shifter for the 5-speed: boot, stick, knob.
	add(group, slab(0.12, 0.04, 0.12, 0.04, 0.015), trimMat, [0.26, CAB_FLOOR_Y + 0.05, 0], inner);
	const stick = new CylinderGeometry(0.012, 0.012, 0.38, 8);
	add(group, stick, silverMat, [0.24, CAB_FLOOR_Y + 0.24, 0], { rot: [0, 0, 0.12], outline: 0 });
	const knob = new CylinderGeometry(0.035, 0.03, 0.06, 12);
	add(group, knob, trimMat, [0.22, CAB_FLOOR_Y + 0.44, 0], inner);

	// Headliner under the roof, and a rear-view mirror at the top of the windshield.
	add(group, slab(0.64, 0.02, cabInnerW, 0.01, 0.005), headlinerMat, [-0.19, 1.555, 0], inner);
	add(group, slab(0.02, 0.06, 0.03, 0.008, 0.004), trimMat, [0.14, 1.52, 0], inner);
	add(group, slab(0.03, 0.06, 0.22, 0.02, 0.008), trimMat, [0.15, 1.47, 0], inner);

	const steering = new Group();
	steering.position.set(0.36, 1.14, -0.38);
	steering.rotation.z = -0.4; // top tilts forward
	const wheelRing = new TorusGeometry(0.17, 0.022, 8, 28);
	wheelRing.rotateY(Math.PI / 2);
	add(steering, wheelRing, trimMat, [0, 0, 0], { outline: 0 });
	const wheelHub = new CylinderGeometry(0.05, 0.05, 0.04, 12);
	wheelHub.rotateZ(Math.PI / 2);
	add(steering, wheelHub, trimMat, [0, 0, 0], { outline: 0 });
	add(steering, slab(0.015, 0.02, 0.32, 0.005, 0.002), trimMat, [0, 0, 0], { outline: 0 });
	// Column runs from the hub down into the dash, along the wheel's axis.
	const column = new CylinderGeometry(0.03, 0.035, 0.3, 10);
	column.rotateZ(Math.PI / 2);
	add(steering, column, trimMat, [0.15, 0, 0], { outline: 0 });
	group.add(steering);

	// --- Front end: the US-market 1989-91 pickup, not the Hilux sold elsewhere ---
	// One lamp band runs the full width under the hood's leading edge: corner lamp, 7x6-inch sealed-beam
	// headlight, a black grille with chrome TOYOTA letters, then the mirror image. Below it, a chrome
	// bumper with amber turn lamps, and a body-color valance with slots. (The Hilux of the same years
	// had a gray plastic bumper and all-clear corner lamps; the US truck's corner lamps carry an amber
	// side-marker section that wraps onto the fender.)
	const bandY = FRONT.bandY;
	const bandX = NOSE_X + 0.012;
	add(group, slab(0.05, FRONT.bandH, BODY_HALF_W * 2 - 0.04, 0.02, 0.01), grilleMat, [NOSE_X - 0.005, bandY, 0], { outline: 0.02 });
	// Grille insert: five dark slots between four bars, split into thirds by two vertical posts.
	const grilleW = FRONT.grilleHalfW * 2;
	add(group, slab(0.02, FRONT.bandH - 0.03, grilleW, 0.006, 0.003), trimMat, [bandX + 0.004, bandY, 0], { outline: 0 });
	for (let i = 0; i < 4; i++) {
		const y = bandY - FRONT.bandH / 2 + 0.015 + ((i + 1) * (FRONT.bandH - 0.03)) / 5;
		add(group, slab(0.022, 0.012, grilleW - 0.02, 0.004, 0.002), grilleMat, [bandX + 0.01, y, 0], { outline: 0 });
	}
	for (const z of [-FRONT.grilleHalfW * 0.48, FRONT.grilleHalfW * 0.48]) {
		add(group, slab(0.026, FRONT.bandH - 0.03, 0.022, 0.006, 0.003), grilleMat, [bandX + 0.012, bandY, z], { outline: 0 });
	}
	lettering("TOYOTA", [bandX + 0.03, bandY, 0], 0.062, 0.014, 1, silverMat);
	pair((side) => {
		// Sealed-beam headlight in a dark bezel, centered between the grille and the corner lamp.
		const headZ = side * FRONT.headZ;
		add(group, slab(0.03, FRONT.headH + 0.03, FRONT.headW + 0.03, 0.012, 0.006), grilleMat, [bandX + 0.004, bandY, headZ], { outline: 0 });
		add(group, slab(0.04, FRONT.headH, FRONT.headW, 0.02, 0.012), headMat, [bandX + 0.014, bandY, headZ], { outline: 0.012 });
		// Corner lamp: a clear lens with an amber insert running parallel to its raked outboard edge,
		// wrapping back round the fender with a matching raked rear edge. Drawn as outlines in the lamp's
		// own plane (u outboard from its inner edge, v up), turned to face forward on either side.
		const h = FRONT.headH;
		const lens = (pts: [number, number][]) => new Shape(pts.map(([u, v]) => new Vector2(u, v)));
		const zIn = FRONT.headZ + FRONT.headW / 2 + 0.018;
		const face = { rot: [0, -side * (Math.PI / 2), 0] as [number, number, number] };
		// Clear lens inboard; amber from the raked line out to the corner, continuing round onto the side.
		const amberW = 0.045;
		const uSide = BODY_HALF_W + 0.004 - zIn;
		const lensX = bandX + 0.008;
		add(group, extrude(lens([[0, -h / 2], [FRONT.cornerBotW - amberW, -h / 2], [FRONT.cornerTopW - amberW, h / 2], [0, h / 2]]), 0.035, 0.006, false), headMat, [lensX, bandY, side * zIn], {
			...face,
			outline: 0.01,
		});
		add(group, extrude(lens([[FRONT.cornerBotW - amberW, -h / 2], [uSide, -h / 2], [uSide, h / 2], [FRONT.cornerTopW - amberW, h / 2]]), 0.035, 0.006, false), amberMat, [lensX, bandY, side * zIn], {
			...face,
			outline: 0.01,
		});
		// The amber side marker wraps back along the fender from the front lens, its rear edge raked the same way.
		const wrap = lens([[lensX + 0.0175 - NOSE_X, -h / 2], [-FRONT.cornerWrapBot, -h / 2], [-FRONT.cornerWrapTop, h / 2], [lensX + 0.0175 - NOSE_X, h / 2]]);
		add(group, extrude(wrap, 0.03, 0.006, false), amberMat, [NOSE_X, bandY, side * (BODY_HALF_W + 0.006)], { outline: 0.01 });
	});

	// Chrome bumper: a pressed face that wraps back around both front corners, amber turn lamps set in it.
	const bumperY = FRONT.bumperY;
	add(group, slab(0.1, FRONT.bumperH, BODY_HALF_W * 2 + 0.04, 0.035, 0.02), chromeMat, [NOSE_X + 0.07, bumperY, 0], { outline: OUTLINE_SMALL });
	pair((side) => {
		add(group, slab(0.26, FRONT.bumperH, 0.08, 0.035, 0.02), chromeMat, [NOSE_X - 0.04, bumperY, side * (BODY_HALF_W + 0.0)], { outline: OUTLINE_SMALL });
		add(group, slab(0.02, 0.055, 0.17, 0.012, 0.006), amberMat, [NOSE_X + 0.12, bumperY - 0.02, side * FRONT.turnZ], { outline: 0.01 });
	});
	// A pressed crease along the bumper face.
	add(group, slab(0.01, 0.01, BODY_HALF_W * 2 - 0.1, 0.003, 0.002), trimMat, [NOSE_X + 0.121, bumperY + 0.035, 0], { outline: 0 });
	// Valance under the bumper, in body color, with horizontal slots.
	add(group, slab(0.1, FRONT.valanceH, BODY_HALF_W * 2 - 0.12, 0.03, 0.015), bodyMat, [NOSE_X + 0.02, FRONT.valanceY, 0], { outline: 0.02 });
	for (let i = 0; i < 4; i++) {
		add(group, slab(0.012, 0.014, 1.0, 0.005, 0.003), trimMat, [NOSE_X + 0.071, FRONT.valanceY - 0.045 + i * 0.03, 0], { outline: 0 });
	}

	// --- Rear end ---
	// Chrome step bumper wrapping round the corners, the plate recessed in its center.
	add(group, slab(0.17, 0.17, 1.74, 0.05, 0.02), chromeMat, [TAIL_X - 0.11, 0.45, 0]);
	pair((side) => add(group, slab(0.2, 0.17, 0.08, 0.05, 0.02), chromeMat, [TAIL_X - 0.04, 0.45, side * 0.85], { outline: OUTLINE_SMALL }));
	add(group, slab(0.02, 0.12, 0.34, 0.02, 0.008), trimMat, [TAIL_X - 0.196, 0.45, 0], { outline: 0 }); // plate recess
	add(group, slab(0.02, 0.1, 0.3, 0.02, 0.008), headlinerMat, [TAIL_X - 0.2, 0.45, 0], { outline: 0.01 }); // plate
	pair((side) => {
		// Tall tail lamp on each bed corner: amber turn signal on top, clear reverse lamp, then the big red tail/stop lens.
		const lampZ = side * (BODY_HALF_W - 0.045);
		const lampX = TAIL_X - 0.012;
		const lampH = TAIL_LAMP.amber + TAIL_LAMP.clear + TAIL_LAMP.red;
		// Dark bezel round the whole lamp, so the red lens stands off red paint.
		add(group, slab(0.024, lampH + 0.024, TAIL_LAMP.w + 0.024, 0.01, 0.004), trimMat, [lampX + 0.006, TAIL_LAMP.top - lampH / 2, lampZ], { outline: 0 });
		add(group, slab(0.03, TAIL_LAMP.amber, TAIL_LAMP.w, 0.008, 0.004), amberMat, [lampX, TAIL_LAMP.top - TAIL_LAMP.amber / 2, lampZ], { outline: 0.01 });
		add(group, slab(0.03, TAIL_LAMP.clear, TAIL_LAMP.w, 0.004, 0.003), clearLensMat, [lampX, TAIL_LAMP.top - TAIL_LAMP.amber - TAIL_LAMP.clear / 2, lampZ], { outline: 0.01 });
		add(group, slab(0.03, TAIL_LAMP.red, TAIL_LAMP.w, 0.008, 0.004), tailMat, [lampX, TAIL_LAMP.top - TAIL_LAMP.amber - TAIL_LAMP.clear - TAIL_LAMP.red / 2, lampZ], {
			outline: 0.01,
		});
		// Mudflaps behind the rear and front wheels.
		add(group, slab(0.03, 0.24, 0.2, 0.01, 0.005), trimMat, [REAR_AXLE_X - 0.5, 0.28, side * 0.76], { outline: 0 });
		add(group, slab(0.03, 0.22, 0.2, 0.01, 0.005), trimMat, [FRONT_AXLE_X - 0.5, 0.28, side * 0.76], { outline: 0 });
	});

	// --- Wheels: lathe tire, steel rim with lip, recessed dish, vent slots, cap and lug nuts ---
	const tireProfile = [
		new Vector2(0.17, -0.1),
		new Vector2(0.29, -0.1),
		new Vector2(0.325, -0.075),
		new Vector2(WHEEL_R, -0.05),
		new Vector2(WHEEL_R, 0.05),
		new Vector2(0.325, 0.075),
		new Vector2(0.29, 0.1),
		new Vector2(0.17, 0.1),
	];
	const wheels: Group[] = [];
	for (const [x, z] of [
		[FRONT_AXLE_X, 0.72],
		[FRONT_AXLE_X, -0.72],
		[REAR_AXLE_X, 0.72],
		[REAR_AXLE_X, -0.72],
	] as [number, number][]) {
		const pivot = new Group();
		pivot.position.set(x, AXLE_Y, z);

		const tire = new LatheGeometry(tireProfile, 32);
		tire.rotateX(Math.PI / 2);
		add(pivot, tire, trimMat, [0, 0, 0]);

		for (const s of [1, -1]) {
			const disc = (r: number, h: number, mat: Material, zOff: number, seg = 24) => {
				const g = new CylinderGeometry(r, r, h, seg);
				g.rotateX(Math.PI / 2);
				add(pivot, g, mat, [0, 0, s * zOff], { outline: 0 });
			};
			disc(0.185, 0.02, silverMat, 0.088); // rim face
			add(pivot, new TorusGeometry(0.185, 0.02, 6, 28), silverMat, [0, 0, s * 0.094], { outline: 0 }); // rim lip
			disc(0.15, 0.012, dishMat, 0.1); // recessed dish
			disc(0.06, 0.03, silverMat, 0.106, 16); // hub cap
			disc(0.028, 0.034, hubMat, 0.108, 12); // brand-colored center
			for (let i = 0; i < 5; i++) {
				const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
				const lug = new CylinderGeometry(0.014, 0.014, 0.03, 6);
				lug.rotateX(Math.PI / 2);
				add(pivot, lug, trimMat, [Math.cos(a) * 0.095, Math.sin(a) * 0.095, s * 0.11], { outline: 0 });
				// Radial vent slots in the dish, between the lugs.
				const b = (i / 5) * Math.PI * 2;
				add(pivot, slab(0.06, 0.022, 0.014, 0.008, 0.003), trimMat, [Math.cos(b) * 0.125, Math.sin(b) * 0.125, s * 0.107], {
					rot: [0, 0, b],
					outline: 0,
				});
			}
		}

		group.add(pivot);
		wheels.push(pivot);
	}

	// Hard, flat ground shadow that turns with the truck.
	const shadowGeo = new CircleGeometry(1, 40);
	shadowGeo.rotateX(-Math.PI / 2);
	const shadowMat = new MeshBasicMaterial({ color: colors.trim, transparent: true, opacity: 0.3 });
	kit.material(shadowMat);
	kit.geometry(shadowGeo);
	const shadow = new Mesh(shadowGeo, shadowMat);
	shadow.scale.set(3.0, 1, 1.3);
	shadow.position.set(-0.25, 0.005, 0);
	group.add(shadow);

	return {
		group,
		wheels,
		parts: kit.parts,
		lights: { head: headMat, tail: tailMat },
		dispose: kit.dispose,
	};
}
