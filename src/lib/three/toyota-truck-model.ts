import {
	type BufferGeometry,
	CatmullRomCurve3,
	CircleGeometry,
	Color,
	CylinderGeometry,
	ExtrudeGeometry,
	Group,
	LatheGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	RingGeometry,
	Shape,
	ShapeGeometry,
	TorusGeometry,
	TubeGeometry,
	Vector2,
	Vector3,
	type Material,
	type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OUTLINE, OUTLINE_SMALL, createPartKit, extrude, shade, slab, tint } from "./kit";
import { TC_LONGBOARD, buildLongboard, deckOffsetAt } from "./longboard-model";

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
	hub: "#b9bec3",
	light: "#fff4c7",
	bumper: "#3a3d40",
	silver: "#dfe3e6",
	amber: "#ff9f1c",
	tail: "#d62828",
	interior: "#6b7076",
};

/** Choices for the truck builder. Leave them all out and you get the hero truck, unchanged. */
export interface TruckOptions {
	/** Hood, doors and tailgate on hinges (see `openers`), and an open engine bay behind the grille. */
	openable?: boolean;
	/** Something to mount in the engine bay (the 22R-E), origin at its crankshaft centerline, front toward +X. */
	engine?: Object3D;
	/** Wheel size and look. 5 x 114.3 lug pattern, as on the 2WD truck. */
	wheel?: {
		diameterIn: number;
		widthIn: number;
		offsetMm: number;
		style: "hubcap" | "steel" | "alloy" | "hammer" | "eighthole" | "mesh";
		/** Spoke finish for the mesh wheel: BBS Diamond Black (the default) or chrome. */
		finish?: "black" | "chrome";
	};
	/**
	 * Factory 7x6 sealed beams; a glass H4 conversion over a chrome reflector; an LED unit made to look
	 * like the old lamp (clear lens, chrome reflector, LED module); or an LED unit with rows of emitters.
	 */
	headlights?: "sealed" | "h4" | "retro" | "led";
	/**
	 * Tire size: the wheels sit on the ground, so a taller tire raises the whole truck. `lugs` gives it a
	 * mud tread: lugs this deep (inches) across a tread this wide (inches), standing proud of the carcass.
	 */
	tire?: { widthMm: number; aspect: number; rimIn: number; lugs?: { depthIn: number; treadWidthIn: number } };
	/** Ride-height change at each axle, meters (negative is lower). */
	ride?: { front: number; rear: number };
	/** Visible light transmission of the side windows, the rear window and the windshield (fractions; the windshield stays factory if left out). */
	glassVlt?: { front: number; rear: number; windshield?: number };
	/** The grille shell: black, chrome, the body color, or black with its TOYOTA letters blacked out too. */
	grille?: "painted" | "chrome" | "body" | "blackout";
	/** Over the bed: nothing, a black spray-in liner (still open), a cab-high shell, or a soft tonneau. */
	bed?: "none" | "liner" | "shell" | "tonneau";
	/** Rear-window stickers: the 7.5 x 2.5 in Kalapana, T&C's 6 in logo, the Lemon, the 3.75 x 2.5 in Kanaka Maoli flag and the Da Hui badge. */
	stickers?: ("kalapana" | "tc" | "lemon" | "kanaka" | "dahui")[];
	/** The 7.5 x 2.5 in Kalapana sticker on the rear window (same as `stickers: ["kalapana"]`). */
	sticker?: boolean;
	/** Metallic paint flakes catch more light than a solid color. */
	metallicPaint?: boolean;
	/** The factory white TOYOTA on the tailgate. Default true; false leaves the tailgate plain. */
	tailgateLettering?: boolean;
	/** The tailgate letters' color; factory white if left out. */
	tailgateLetterColor?: string;
	/** What rides in the open bed: a longboard, broken-down ulua rods, a cooler, rubbish bags or a kids' dirt bike. */
	cargo?: "none" | "longboard" | "ulua" | "cooler" | "rubbish" | "dirtbike";
	/** A longboard in the open bed, deck down and fin up, tail hanging out over the tailgate (same as `cargo: "longboard"`). */
	board?: boolean;
	/** A tube roll bar in the bed behind the cab, as on Marty McFly's truck. */
	rack?: "none" | "rollbar";
	/** The four 6-inch KC Daylighters on the roll bar, by cover color; yellow (McFly's) if left out. */
	rackLights?: "none" | "yellow" | "black";
	/** Under the doors: 3-inch round step bars, flat chrome running boards, or tube rock sliders with fill plates. */
	steps?: "none" | "tube" | "board" | "slider";
	/** Shocks on custom hoops, stood up just inboard of each front tire where they show in the wheel well. Left out, shocks aren't drawn (at their stock mounts they sit behind the tires). */
	shocks?: "factory" | "hoops";
	/** On hoops: shocks per front wheel, body diameter (inches) and colors. Left out, two Rancho RS5000Xs (2.25 in, white, red boots). */
	shockSetup?: { perWheel: 1 | 2; diameterIn: number; body: string; boot: string; metallic?: boolean };
	/** The factory 1.75-inch tailpipe, the same with a chrome tip, a side-exit turndown ahead of the rear tire, or twin 5 x 36 in chrome stacks in the bed. Left out, no exhaust is drawn. */
	exhaust?: "factory" | "tip" | "turndown" | "stacks";
}

/** How far each hinged part swings open, radians. */
export const OPEN_ANGLES = { hood: 1.05, door: 1.15, tailgate: Math.PI / 2 } as const;

export type OpenerKey = "hood" | "doorRight" | "doorLeft" | "tailgate";

export interface TruckModel {
	group: Group;
	/** Wheel pivots, spin them about their local Z axis. */
	wheels: Group[];
	/** Every mesh that makes up the visible truck (excludes outline shells and the shadow). */
	parts: Mesh[];
	/** Materials with emissive channels, for flashing the lights. */
	lights: { head: MeshStandardMaterial; tail: MeshStandardMaterial };
	/**
	 * Hinge pivots, only when built `openable`. Rotate them about their hinge axis (hood and tailgate
	 * about Z, doors about Y) by up to OPEN_ANGLES; `setOpen` does it with the right signs. Every mesh
	 * inside carries `userData.opener`, for picking.
	 */
	openers?: Record<OpenerKey, Group>;
	/** Swing a hinged part to a fraction (0 shut, 1 fully open) of its travel. */
	setOpen?: (key: OpenerKey, amount: number) => void;
	dispose: () => void;
}

const INCH = 0.0254;
/** The stock 14 x 5.5 wheel at +20 mm puts its center plane here, so its hub face is 20 mm outboard of it. */
const HUB_FACE_Z = 0.74;
/** 5 x 114.3 bolt circle radius. */
const LUG_RADIUS = 0.11430 / 2;

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
// Door edges: the seams drawn on the closed cab, and the hinged door's outline when it opens.
const DOOR_FRONT_X = 0.62;
const DOOR_BACK_X = -0.5;
const DOOR_BOTTOM_Y = 0.38;
/** Width of the hood's raised center section. */
const HOOD_BULGE_W = 0.74;

/**
 * The front end, from photos of 1989-91 US-market pickups. The headlights are 7x6-inch rectangular
 * sealed beams (H6054: 200 x 142 mm); everything else is sized relative to them and the 1.64 m body.
 */
/** Where cargo stands in the bed: on the tops of the floor's stamped ribs. */
export const CARGO_FLOOR_Y = BED_FLOOR_Y + 0.021;
/** T&C's Standard Logo sticker: 6 inches across. */
const TC_STICKER_R = 3 * INCH;
/**
 * Stickers are drawn half again their real size: at true size a 4 in sticker is a few pixels on screen.
 * Each sticker's own frame stays in real inches; only its group is scaled up.
 */
export const STICKER_DRAW_SCALE = 1.5;
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

/** A band just inside an arch outline: `inset` in from it and `width` thick. Local origin at the axle. */
function archBand(inset: number, width: number): Shape {
	const outer = archPoints(0, 0, ARCH_RX - inset, ARCH_RY - inset);
	const inner = archPoints(0, 0, ARCH_RX - inset - width, ARCH_RY - inset - width).reverse();
	return new Shape([...outer, ...inner]);
}

/** Lug pitches around each half of a mud tread. Interco doesn't publish a count, so this is an estimate. */
const MUD_LUG_PITCHES = 18;

/**
 * Mud-terrain lugs, merged into one geometry, around a tire whose axis is Z. Interco's three-stage
 * pattern: short, intermediate and long lugs in turn, each running in from its shoulder, staggered half a
 * pitch between the two halves of the tread, and stepping down over the shoulder. The lug depth and the
 * tread width come from the tire's spec; the lug count and proportions are estimates.
 */
function mudLugs(crownR: number, depth: number, halfW: number, treadHalf: number): BufferGeometry {
	const pieces: BufferGeometry[] = [];
	const pitch = (2 * Math.PI) / MUD_LUG_PITCHES;
	const half = (pitch * 0.45) / 2; // each lug fills 45% of its pitch
	// A ring sector from r0 to r1 across the lug's angle, `len` long along the axle and centered on it.
	const sector = (r0: number, r1: number, len: number) => {
		const s = new Shape();
		s.absarc(0, 0, r1, -half, half, false);
		s.absarc(0, 0, r0, half, -half, true);
		const g = new ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 4 });
		g.translate(0, 0, -len / 2);
		return g;
	};
	const stages = [0.36, 0.5, 0.64]; // share of the tread width each lug runs in from its shoulder
	for (const side of [1, -1]) {
		for (let i = 0; i < MUD_LUG_PITCHES; i++) {
			const theta = (i + (side > 0 ? 0 : 0.5)) * pitch;
			const len = stages[i % 3] * 2 * treadHalf;
			// The tread lug, its top on the tire's full radius, sunk a little into the rounded crown, raked a few degrees.
			const lug = sector(crownR - 0.02, crownR + depth, len);
			lug.rotateX(side * 0.18);
			lug.translate(0, 0, side * (treadHalf - len / 2));
			// Its end, stepping down over the shoulder onto the sidewall.
			const shoulder = sector(crownR - 0.05, crownR + depth - 0.006, halfW * 0.97 - treadHalf + 0.005);
			shoulder.translate(0, 0, side * (treadHalf + halfW * 0.97) / 2);
			for (const g of [lug, shoulder]) {
				g.rotateZ(theta);
				pieces.push(g);
			}
		}
	}
	const merged = mergeGeometries(pieces)!;
	pieces.forEach((g) => g.dispose());
	return merged;
}

/**
 * Raised block lettering, as stroke segments on a cell 0.75 wide and 1 tall. Only the letters
 * in TOYOTA are needed.
 */
const GLYPHS: Record<string, [number, number, number, number][]> = {
	E: [
		[0.72, 1, 0, 1],
		[0, 1, 0, 0],
		[0, 0, 0.72, 0],
		[0, 0.5, 0.55, 0.5],
	],
	F: [
		[0.72, 1, 0, 1],
		[0, 1, 0, 0],
		[0, 0.5, 0.55, 0.5],
	],
	H: [
		[0, 0, 0, 1],
		[0.75, 0, 0.75, 1],
		[0, 0.5, 0.75, 0.5],
	],
	I: [
		[0.375, 0, 0.375, 1],
		[0.1, 1, 0.65, 1],
		[0.1, 0, 0.65, 0],
	],
	D: [
		[0, 0, 0, 1],
		[0, 1, 0.5, 1],
		[0.5, 1, 0.75, 0.75],
		[0.75, 0.75, 0.75, 0.25],
		[0.75, 0.25, 0.5, 0],
		[0.5, 0, 0, 0],
	],
	R: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 1],
		[0.75, 1, 0.75, 0.5],
		[0.75, 0.5, 0, 0.5],
		[0.3, 0.5, 0.75, 0],
	],
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
	C: [
		[0.75, 1, 0, 1],
		[0, 1, 0, 0],
		[0, 0, 0.75, 0],
	],
	K: [
		[0, 0, 0, 1],
		[0, 0.45, 0.75, 1],
		[0.25, 0.62, 0.75, 0],
	],
	L: [
		[0, 1, 0, 0],
		[0, 0, 0.7, 0],
	],
	P: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 1],
		[0.75, 1, 0.75, 0.5],
		[0.75, 0.5, 0, 0.5],
	],
	N: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 0],
		[0.75, 0, 0.75, 1],
	],
};

export function buildToyotaTruck(colors: TruckColors = DEFAULT_TRUCK_COLORS, options: TruckOptions = {}): TruckModel {
	const openable = !!options.openable;
	const kit = createPartKit(colors.trim);
	const { add, std } = kit;
	const bodyMat =
		options.metallicPaint === undefined ? std(colors.body, 0.36, 0.35) : options.metallicPaint ? std(colors.body, 0.3, 0.6) : std(colors.body, 0.42, 0.12);
	const bedFloorMat = std(shade(colors.body, 0.45), 0.5, 0.2);
	const creaseMat = std(tint(colors.body, 0.22), 0.3, 0.35);
	const trimMat = std(colors.trim, 0.8);
	const grilleMat = std(colors.bumper, 0.6);
	const chromeMat = std(tint(colors.silver, 0.3), 0.16, 0.9);
	/** Fresh show chrome, brighter than the factory bumpers: the chrome wheels and the exhaust tip. */
	const mirrorMat = std("#ffffff", 0.05, 1);
	const dishMat = std(shade(colors.silver, 0.35), 0.5, 0.6);
	// Shock hoops stand the shocks (two 2.25 in Rancho RS5000Xs unless told otherwise) just inboard of each
	// front tire, with a little clearance, so the dark wheel well steps back behind them.
	const hoops = options.shocks === "hoops";
	const shockSetup = options.shockSetup ?? { perWheel: 2, diameterIn: 2.25, body: "#f2f1ec", boot: "#c41e2a", metallic: false };
	const SHOCK_R = (shockSetup.diameterIn * INCH) / 2;
	const tireInnerZ = HUB_FACE_Z - (options.wheel?.offsetMm ?? 20) / 1000 - (options.tire?.widthMm ?? 195) / 2000;
	const shockZ = Math.min(tireInnerZ - SHOCK_R - 0.03, 0.6);
	const wellZ = shockZ - SHOCK_R - 0.03;
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
	// TOYOTA is painted on (factory white) inside the tailgate's indent, which sits a shade darker in shadow.
	const letterPaintMat = std(options.tailgateLetterColor ?? "#f4f2ec", 0.5, options.tailgateLetterColor && options.tailgateLetterColor !== "#f4f2ec" ? 0.3 : 0);
	const recessMat = std(shade(colors.body, 0.14), 0.4, 0.3);
	const tailMat = std(colors.tail, 0.35);
	tailMat.emissive = new Color(colors.tail);
	tailMat.emissiveIntensity = 0;
	/**
	 * Glass with a given visible light transmission. Factory glass (0.74) keeps its pale tint; a pane with
	 * film on it takes the black film's color, and its opacity (1 - VLT) sets how much of the cab shows through.
	 */
	const glassWith = (vlt: number) =>
		kit.material(
			new MeshStandardMaterial({
				color: vlt >= 0.74 ? new Color(colors.glass) : new Color("#0b0d10"),
				roughness: 0.05,
				metalness: 0.1,
				transparent: true,
				opacity: 1 - vlt,
				depthWrite: false,
			}),
		);
	const glassMat = glassWith(0.74);
	const sideGlassMat = options.glassVlt ? glassWith(options.glassVlt.front) : glassMat;
	const rearGlassMat = options.glassVlt ? glassWith(options.glassVlt.rear) : glassMat;
	const windshieldMat = options.glassVlt?.windshield !== undefined ? glassWith(options.glassVlt.windshield) : glassMat;
	const surroundMat = options.grille === "chrome" ? chromeMat : options.grille === "body" ? bodyMat : grilleMat;
	const ledHousingMat = std("#1b1d20", 0.35, 0.4);
	/** A polished reflector bowl seen through a clear lens: bright, not mirror-dark without an environment to reflect. */
	const reflectorMat = std("#dfe3e7", 0.22, 0.55);
	const kcYellowMat = std("#ffd400", 0.45);
	let boardDispose: (() => void) | null = null;
	const stickerMat = std("#4c9a6a", 0.55);
	const stickerInkMat = std("#f7f6f1", 0.5);
	const cargo = options.cargo ?? (options.board ? "longboard" : "none");
	const stickers = options.stickers ?? (options.sticker ? ["kalapana"] : []);
	/** LINE-X: a black, textured, matte coat. */
	const linerMat = std("#1c1d1f", 0.97, 0.02);
	const bedLined = options.bed === "liner";

	const group = new Group();
	// Everything sprung rides in `body`, so ride height and tire size can raise, lower and pitch it over the wheels.
	const body = new Group();
	group.add(body);
	/** Both sides of the truck: mirrors Z. */
	const pair = (fn: (side: 1 | -1) => void) => {
		fn(1);
		fn(-1);
	};
	/**
	 * Raised block lettering on a face perpendicular to X, centered on `center`. `facing` is the
	 * direction the face points (+1 front, -1 rear), which decides which way along Z reads left to right.
	 */
	const lettering = (text: string, center: [number, number, number], height: number, stroke: number, facing: 1 | -1, mat: Material, parent: Object3D = body) => {
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
				add(parent, slab(0.02, stroke, Math.hypot(du, dv) + stroke, stroke * 0.3, 0.004), mat, [center[0], center[1] + v, center[2] + dir * u], {
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

	/**
	 * The rest of the engine bay, for when the hood is up. The stock 1989-95 22R-E layout: the air cleaner
	 * and its air flow meter on the driver's side at the front, beside a white plastic reservoir, with the
	 * crossover duct running across the front of the engine to the throttle body (Trail-Gear's 1989-95 22R-E
	 * intake kit instructions, images.carid.com/trail-gear/items/pdf/180316-1-kit-installation-instructions.pdf);
	 * the battery opposite it on the passenger side; the brake booster and
	 * master cylinder on the driver's side of the firewall, as on any left-hand-drive truck; the inner fender
	 * aprons in body color. Where the washer bottle and fuse box sit, and every size but the battery's, are
	 * estimates.
	 */
	const buildBay = (engine: Object3D | undefined) => {
		const bay = new Group();
		bay.name = "bay";
		body.add(bay);
		const SHELF_Y = 0.79; // over the wheel well's roof and the tallest tire the truck can carry
		const TRAY_Y = 0.6; // the front corners, ahead of the wheels, sit lower
		// Inner edge, over the edge of the floor below; with shock hoops, just inboard of them.
		const IN = hoops ? Math.max(0.33, Math.min(0.42, shockZ - 0.065)) : 0.42;
		const OUT = BODY_HALF_W - 0.12 - 0.015; // the inner fender wall
		const wellFrontX = FRONT_AXLE_X + ARCH_RX + 0.02;
		const radiatorBackX = NOSE_X - 0.1 - 0.025;
		const zMid = (IN + OUT) / 2;
		pair((side) => {
			add(bay, slab(wellFrontX - CAB_FRONT_X - 0.06, 0.015, OUT - IN, 0.004, 0.002), bodyMat, [(wellFrontX + CAB_FRONT_X + 0.06) / 2, SHELF_Y, side * zMid], { outline: 0.006 });
			add(bay, slab(0.015, SHELF_Y - TRAY_Y, OUT - IN, 0.004, 0.002), bodyMat, [wellFrontX, (SHELF_Y + TRAY_Y) / 2, side * zMid], { outline: 0.006 });
			add(bay, slab(radiatorBackX - wellFrontX, 0.015, OUT - IN, 0.004, 0.002), bodyMat, [(radiatorBackX + wellFrontX) / 2, TRAY_Y, side * zMid], { outline: 0.006 });
			// The apron's inner wall, down to the frame, so the wheel well doesn't show past the shelf's edge.
			const wallBot = 0.2;
			add(bay, slab(wellFrontX - CAB_FRONT_X - 0.06, SHELF_Y - wallBot, 0.015, 0.004, 0.002), bodyMat, [(wellFrontX + CAB_FRONT_X + 0.06) / 2, (SHELF_Y + wallBot) / 2, side * IN], { outline: 0.006 });
			add(bay, slab(radiatorBackX - wellFrontX, TRAY_Y - wallBot, 0.015, 0.004, 0.002), bodyMat, [(radiatorBackX + wellFrontX) / 2, (TRAY_Y + wallBot) / 2, side * IN], { outline: 0.006 });
		});
		const onShelf = SHELF_Y + 0.0075;
		const onTray = TRAY_Y + 0.0075;
		const blackPlastic = std("#1d1e20", 0.7);
		const castAlu = std("#a7abaf", 0.45, 0.6);
		const milky = kit.material(new MeshStandardMaterial({ color: new Color("#eeece4"), roughness: 0.35, transparent: true, opacity: 0.82 }));
		const tube = (pts: [number, number, number][], r: number) => new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, "catmullrom", 0.3), 48, r, 12, false);

		// Battery, passenger side: BCI Group 24F, 10.25 x 6.81 x 8.88 in, long side across the truck, held by a
		// bar over the top, posts to the inboard side, positive in a red boot.
		const bat = { l: 10.25 * INCH, w: 6.81 * INCH, h: 8.88 * INCH };
		const batX = (wellFrontX + radiatorBackX) / 2;
		const batZ = OUT - bat.l / 2;
		const batTop = onTray + bat.h;
		add(bay, slab(bat.w, bat.h, bat.l, 0.01, 0.004), std("#232427", 0.55), [batX, onTray + bat.h / 2, batZ], { outline: 0.01 });
		add(bay, slab(bat.w + 0.004, 0.018, bat.l + 0.004, 0.006, 0.003), std("#34363a", 0.5), [batX, batTop - 0.009, batZ], { outline: 0 });
		const postZ = batZ - bat.l / 2 + 0.035;
		for (const [dx, mat] of [[0.04, std("#c42a2a", 0.5)], [-0.04, std("#8d9094", 0.4, 0.6)]] as const) {
			add(bay, new CylinderGeometry(0.014, 0.016, 0.028, 14), mat, [batX + dx, batTop + 0.014, postZ], { outline: 0.004 });
		}
		add(bay, slab(0.022, 0.012, bat.l + 0.03, 0.004, 0.002), trimMat, [batX, batTop + 0.006, batZ + 0.02], { outline: 0.003 });
		for (const dz of [-1, 1]) add(bay, slab(0.008, bat.h * 0.85, 0.008, 0.003, 0.001), silverMat, [batX, onTray + bat.h * 0.45, batZ + 0.02 + dz * (bat.l / 2 + 0.016)], { outline: 0 });
		// Cables: positive down past the engine toward the starter on the passenger side, negative to the body.
		add(bay, tube([[batX + 0.04, batTop + 0.03, postZ], [batX + 0.03, batTop + 0.02, postZ - 0.05], [wellFrontX + 0.03, 0.55, 0.34], [1.55, 0.34, 0.3]], 0.008), std("#b52222", 0.5), [0, 0, 0], { outline: 0.003 });
		add(bay, tube([[batX - 0.04, batTop + 0.03, postZ], [batX - 0.07, batTop - 0.02, postZ - 0.02], [wellFrontX + 0.02, onTray + 0.01, IN + 0.03]], 0.007), trimMat, [0, 0, 0], { outline: 0.003 });

		// Air cleaner, driver's side: a black canister on the tray, its intake snout reaching forward beside the
		// radiator toward the headlamp, the cast air flow meter on its inboard side.
		const ac = { x: 0.2, y: 0.17, z: 0.24 };
		const acX = (wellFrontX + radiatorBackX) / 2 + 0.005;
		const acZ = -(OUT - ac.z / 2);
		add(bay, slab(ac.x, ac.y * 0.55, ac.z, 0.02, 0.01), blackPlastic, [acX, onTray + ac.y * 0.275, acZ], { outline: 0.01 });
		add(bay, slab(ac.x + 0.012, ac.y * 0.45, ac.z + 0.012, 0.025, 0.012), blackPlastic, [acX, onTray + ac.y * 0.775, acZ], { outline: 0.01 });
		for (const dx of [-0.06, 0.06]) add(bay, slab(0.02, 0.03, 0.008, 0.003, 0.001), silverMat, [acX + dx, onTray + ac.y * 0.55, acZ - ac.z / 2 - 0.007], { outline: 0 }); // lid clips
		add(bay, slab(NOSE_X - 0.06 - (acX + ac.x / 2), 0.055, 0.09, 0.012, 0.006), blackPlastic, [(NOSE_X - 0.06 + acX + ac.x / 2) / 2, onTray + 0.06, acZ - 0.05], { outline: 0.006 });
		const afm = { x: 0.12, y: 0.1, z: 0.07 };
		const afmZ = acZ + ac.z / 2 + afm.z / 2;
		const afmY = onTray + 0.1;
		add(bay, slab(afm.x, afm.y, afm.z, 0.012, 0.006), castAlu, [acX, afmY, afmZ], { outline: 0.006 });
		add(bay, slab(0.04, 0.025, 0.03, 0.004, 0.002), blackPlastic, [acX - 0.02, afmY + afm.y / 2 + 0.012, afmZ], { outline: 0 }); // connector
		// The crossover duct: from the meter, up over the fan and across the front of the engine to the hose
		// leaving the throttle body. Drawn only with an engine to meet.
		const stub = engine?.userData.intakeStubEnd as [number, number, number] | undefined;
		if (engine && stub) {
			const end: [number, number, number] = [engine.position.x + stub[0], engine.position.y + stub[1], engine.position.z + stub[2]];
			const start: [number, number, number] = [acX, afmY, afmZ + afm.z / 2];
			const duct = [start, [acX + 0.02, afmY + 0.07, start[2] + 0.06], [radiatorBackX - 0.06, end[1], -0.12], [radiatorBackX - 0.07, end[1], 0.04], end] as [number, number, number][];
			add(bay, tube(duct, 0.036), trimMat, [0, 0, 0], { outline: 0.006 });
		}

		// Coolant reserve tank behind the air cleaner and the washer bottle behind the battery, both milky plastic
		// with black caps; the washer fluid shows blue through its bottle.
		const tank = (x: number, z: number, sx: number, sy: number, sz: number) => {
			add(bay, slab(sx, sy, sz, 0.012, 0.006), milky, [x, onShelf + sy / 2, z], { outline: 0.006 });
			add(bay, new CylinderGeometry(0.018, 0.018, 0.02, 14), blackPlastic, [x + sx / 4, onShelf + sy + 0.01, z], { outline: 0.003 });
		};
		tank(wellFrontX - 0.1, -(IN + 0.08), 0.13, 0.08, 0.1);
		tank(wellFrontX - 0.12, IN + 0.1, 0.16, 0.075, 0.15);
		add(bay, slab(0.15, 0.045, 0.14, 0.01, 0.005), std("#3f7fcf", 0.35), [wellFrontX - 0.12, onShelf + 0.024, IN + 0.1], { outline: 0 });

		// Brake booster and master cylinder on the driver's side of the firewall, the fluid reservoir on top.
		const boosterR = 0.11;
		const boosterX = CAB_FRONT_X + 0.03 + 0.06;
		const brakeY = 0.66;
		const brakeZ = -0.31;
		const booster = new CylinderGeometry(boosterR, boosterR, 0.12, 32);
		booster.rotateZ(Math.PI / 2);
		add(bay, booster, std("#1a1b1d", 0.45, 0.3), [boosterX, brakeY, brakeZ], { outline: 0.008 });
		const mc = new CylinderGeometry(0.03, 0.03, 0.17, 18);
		mc.rotateZ(Math.PI / 2);
		add(bay, mc, castAlu, [boosterX + 0.06 + 0.085, brakeY, brakeZ], { outline: 0.005 });
		add(bay, slab(0.1, 0.06, 0.05, 0.008, 0.004), milky, [boosterX + 0.15, brakeY + 0.06, brakeZ], { outline: 0.004 });
		add(bay, new CylinderGeometry(0.018, 0.018, 0.015, 14), blackPlastic, [boosterX + 0.15, brakeY + 0.098, brakeZ], { outline: 0.003 });
		for (const dz of [-0.012, 0.012]) {
			add(bay, tube([[boosterX + 0.2, brakeY - 0.02, brakeZ + dz], [boosterX + 0.24, brakeY - 0.08, brakeZ - 0.06 + dz], [boosterX + 0.26, brakeY - 0.12, -IN - 0.02 + dz]], 0.004), silverMat, [0, 0, 0], { outline: 0 });
		}

		// Fuse and relay box on the driver's shelf by the firewall.
		add(bay, slab(0.14, 0.06, 0.11, 0.012, 0.006), blackPlastic, [CAB_FRONT_X + 0.24, onShelf + 0.03, -(OUT - 0.07)], { outline: 0.006 });
		add(bay, slab(0.142, 0.006, 0.112, 0.002, 0.001), trimMat, [CAB_FRONT_X + 0.24, onShelf + 0.045, -(OUT - 0.07)], { outline: 0 });
	};

	// --- Front clip: hood and fenders ---
	const openers = {} as Record<OpenerKey, Group>;
	if (!openable) {
		add(body, extrude(frontClipProfile(), BODY_HALF_W * 2, 0.07, false), bodyMat, [0, 0, 0], { outline: OUTLINE });
		hoodDetail(body, 0, 0);
	} else {
		// Fenders as two walls, the hood as a panel hinged at the cowl, and a bay between them.
		pair((side) => {
			add(body, extrude(frontClipProfile(), 0.08, 0.02, false), bodyMat, [0, 0, side * (BODY_HALF_W - 0.04)], { outline: OUTLINE });
			// Inner fender apron, body color as on the real truck; with shock hoops in the well it stops short of
			// the arch so the shocks show.
			if (!hoops) {
				add(body, slab(NOSE_X - CAB_FRONT_X - 0.16, 0.34, 0.03, 0.01, 0.005), bodyMat, [(NOSE_X + CAB_FRONT_X) / 2 - 0.02, 0.72, side * (BODY_HALF_W - 0.12)], {
					outline: 0,
				});
			} else {
				const apron = (x0: number, x1: number, y0: number, y1: number) =>
					add(body, slab(x1 - x0, y1 - y0, 0.03, 0.01, 0.005), bodyMat, [(x0 + x1) / 2, (y0 + y1) / 2, side * (BODY_HALF_W - 0.12)], { outline: 0 });
				const [x0, x1, y0, y1] = [CAB_FRONT_X + 0.06, NOSE_X - 0.1, 0.55, 0.89];
				apron(x0, FRONT_AXLE_X - ARCH_RX, y0, y1);
				apron(FRONT_AXLE_X + ARCH_RX, x1, y0, y1);
				apron(FRONT_AXLE_X - ARCH_RX, FRONT_AXLE_X + ARCH_RX, AXLE_Y + ARCH_RY, y1);
			}
		});
		const hood = new Group();
		hood.name = "hood";
		hood.position.set(CAB_FRONT_X, BELT_Y, 0);
		const hoodShape = new Shape();
		hoodShape.moveTo(0, 0);
		hoodShape.lineTo(NOSE_X - CAB_FRONT_X, 0.9 - BELT_Y);
		hoodShape.lineTo(NOSE_X - CAB_FRONT_X, 0.9 - BELT_Y - 0.04);
		hoodShape.lineTo(0, -0.04);
		add(hood, extrude(hoodShape, 2 * (BODY_HALF_W - 0.085), 0.015, false), bodyMat, [0, 0, 0], { outline: OUTLINE });
		hoodDetail(hood, CAB_FRONT_X, BELT_Y);
		body.add(hood);
		openers.hood = hood;
		// Bay: firewall, radiator behind the grille, the core support's top bar, a dark floor below the engine.
		add(body, slab(0.03, BELT_Y - CAB_FLOOR_Y, BODY_HALF_W * 2 - 0.12, 0.01, 0.005), bedFloorMat, [CAB_FRONT_X + 0.015, (CAB_FLOOR_Y + BELT_Y) / 2, 0], { outline: 0 });
		const radiatorX = NOSE_X - 0.1;
		add(body, slab(0.05, 0.42, 1.1, 0.01, 0.005), trimMat, [radiatorX, 0.62, 0], { outline: 0.01 });
		add(body, slab(0.08, 0.04, BODY_HALF_W * 2 - 0.16, 0.01, 0.005), bodyMat, [NOSE_X - 0.06, 0.865, 0], { outline: 0.01 });
		// The floor only darkens the bay when the hood is up, so it stays tucked between the frame rails and
		// behind the radiator: run out to the nose and the fenders, it showed under the bumper as a big flat
		// plate, most of all on a lowered truck.
		const bayBackX = CAB_FRONT_X + 0.025;
		const bayFrontX = radiatorX - 0.03;
		add(body, slab(bayFrontX - bayBackX, 0.02, 0.84, 0.005, 0.003), trimMat, [(bayFrontX + bayBackX) / 2, 0.2, 0], { outline: 0 }).name = "bay-floor";
		// Body-color face panel between the bumper and the lamp band, and under the valance.
		add(body, slab(0.04, 0.05, BODY_HALF_W * 2 - 0.04, 0.01, 0.005), bodyMat, [NOSE_X - 0.01, 0.675, 0], { outline: 0.01 });
		add(body, slab(0.04, 0.06, BODY_HALF_W * 2 - 0.2, 0.01, 0.005), bodyMat, [NOSE_X - 0.03, 0.36, 0], { outline: 0.01 });
		if (options.engine) {
			// The crank sits low enough that the intake plenum clears the closed hood; the fan stops short of the radiator.
			options.engine.position.set(1.62, 0.42, 0);
			body.add(options.engine);
		}
		buildBay(options.engine);
	}

	// --- Cab shell: floor pan, door walls and back wall, hollow so the interior shows through the glass ---
	const cabLen = CAB_FRONT_X - CAB_BACK_X;
	const cabMidX = (CAB_FRONT_X + CAB_BACK_X) / 2;
	const cabInnerW = BODY_HALF_W * 2 - 0.18;
	add(body, slab(cabLen, CAB_FLOOR_Y - AXLE_Y, BODY_HALF_W * 2 - 0.1, 0.02, 0.01), trimMat, [cabMidX, (AXLE_Y + CAB_FLOOR_Y) / 2, 0], {
		outline: 0,
	});
	/** Door pivots on their front hinges, right then left; filled in further down. */
	const doors: Group[] = [];
	pair((side) => {
		if (!openable) {
			add(body, slab(cabLen, BELT_Y - AXLE_Y, 0.08, 0.03, 0.02), bodyMat, [cabMidX, (AXLE_Y + BELT_Y) / 2, side * (BODY_HALF_W - 0.04)], {
				outline: OUTLINE,
			});
			// Black belt molding along the window sill.
			add(body, slab(cabLen, 0.025, 0.1, 0.01, 0.006), trimMat, [cabMidX, BELT_Y + 0.005, side * (BODY_HALF_W - 0.04)], { outline: 0 });
			return;
		}
		const wallZ = side * (BODY_HALF_W - 0.04);
		// What stays on the cab when the door opens: the rocker under it, and the strips at either end.
		add(body, slab(cabLen, DOOR_BOTTOM_Y - AXLE_Y, 0.08, 0.01, 0.006), bodyMat, [cabMidX, (AXLE_Y + DOOR_BOTTOM_Y) / 2, wallZ], { outline: OUTLINE_SMALL });
		add(body, slab(CAB_FRONT_X - DOOR_FRONT_X, BELT_Y - AXLE_Y, 0.08, 0.01, 0.006), bodyMat, [(CAB_FRONT_X + DOOR_FRONT_X) / 2, (AXLE_Y + BELT_Y) / 2, wallZ], { outline: OUTLINE_SMALL });
		add(body, slab(DOOR_BACK_X - CAB_BACK_X, BELT_Y - AXLE_Y, 0.08, 0.01, 0.006), bodyMat, [(DOOR_BACK_X + CAB_BACK_X) / 2, (AXLE_Y + BELT_Y) / 2, wallZ], { outline: OUTLINE_SMALL });
		const door = new Group();
		door.position.set(DOOR_FRONT_X, 0, side * BODY_HALF_W);
		body.add(door);
		doors.push(door);
		/** Absolute model coordinates to the door's own. */
		const at = (x: number, y: number, z: number): [number, number, number] => [x - DOOR_FRONT_X, y, z - side * BODY_HALF_W];
		const doorLen = DOOR_FRONT_X - DOOR_BACK_X - 0.01;
		const doorMidX = (DOOR_FRONT_X + DOOR_BACK_X) / 2;
		add(door, slab(doorLen, BELT_Y - DOOR_BOTTOM_Y, 0.07, 0.02, 0.012), bodyMat, at(doorMidX, (DOOR_BOTTOM_Y + BELT_Y) / 2, wallZ), { outline: OUTLINE });
		add(door, slab(doorLen, 0.025, 0.09, 0.01, 0.006), trimMat, at(doorMidX, BELT_Y + 0.005, wallZ), { outline: 0 });
		add(door, slab(0.14, 0.04, 0.04, 0.015, 0.008), trimMat, at(-0.34, 0.9, side * (BODY_HALF_W + 0.025)), { outline: 0 }); // handle
		// The crease across the door skin, matching the fender's and the bed's.
		add(door, slab(doorLen, 0.022, 0.014, 0.008, 0.005), creaseMat, at(doorMidX, 0.805, side * (BODY_HALF_W + 0.004)), { outline: 0 });
		add(door, slab(doorLen, 0.012, 0.008, 0.004, 0.002), trimMat, at(doorMidX, 0.788, side * (BODY_HALF_W + 0.002)), { outline: 0 });
		// Window frame divider and the door glass, in the front-window tint.
		add(door, slab(0.045, 0.6, 0.05, 0.015, 0.008), bodyMat, at(-0.2, (BELT_Y + 1.58) / 2, side * 0.77), { outline: 0.02 });
		const doorGlass = new Shape();
		doorGlass.moveTo(0.6, BELT_Y + 0.01);
		doorGlass.lineTo(0.13, 1.56);
		doorGlass.lineTo(-0.48, 1.56);
		doorGlass.lineTo(-0.48, BELT_Y + 0.01);
		add(door, extrude(doorGlass, 0.012, 0.003, false), sideGlassMat, at(0, 0, side * 0.765), { outline: 0 });
		// The door's window frame (sash): along the windshield rake, across the top, down the back.
		const sash = (x0: number, y0: number, x1: number, y1: number) => {
			const len = Math.hypot(x1 - x0, y1 - y0);
			add(door, slab(len + 0.03, 0.035, 0.04, 0.012, 0.006), bodyMat, at((x0 + x1) / 2, (y0 + y1) / 2, side * 0.77), {
				rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)],
				outline: OUTLINE_SMALL,
			});
		};
		sash(0.6, BELT_Y + 0.01, 0.13, 1.56);
		sash(0.13, 1.56, -0.48, 1.56);
		sash(-0.48, 1.56, -0.48, BELT_Y + 0.01);
		// Inside: trim panel, armrest, door pull.
		add(door, slab(doorLen - 0.04, BELT_Y - CAB_FLOOR_Y - 0.04, 0.02, 0.02, 0.008), interiorMat, at(doorMidX, (CAB_FLOOR_Y + BELT_Y) / 2, side * (BODY_HALF_W - 0.09)), { outline: 0 });
		add(door, slab(0.34, 0.05, 0.07, 0.02, 0.01), dashMat, at(0.02, 0.8, side * (BODY_HALF_W - 0.13)), { outline: 0 });
		add(door, slab(0.08, 0.025, 0.02, 0.008, 0.004), silverMat, at(0.42, 0.9, side * (BODY_HALF_W - 0.105)), { outline: 0 });
	});
	add(body, slab(0.06, BELT_Y - CAB_FLOOR_Y, BODY_HALF_W * 2 - 0.1, 0.02, 0.01), bodyMat, [CAB_BACK_X + 0.03, (CAB_FLOOR_Y + BELT_Y) / 2, 0]);
	// Dark wheel well behind the front wheels.
	if (hoops) {
		// Stepped back behind the shocks, its roof lined in black out to the fender.
		const linerW = BODY_HALF_W - 0.01 - wellZ;
		pair((side) => {
			add(body, extrude(archFill(), 0.12, 0, false), trimMat, [FRONT_AXLE_X, AXLE_Y, side * (wellZ - 0.06)], { outline: 0 });
			add(body, extrude(archBand(0.004, 0.02), linerW, 0, false), trimMat, [FRONT_AXLE_X, AXLE_Y, side * (wellZ + linerW / 2)], { outline: 0 });
		});
	} else if (!openable) {
		add(body, extrude(archFill(), BODY_HALF_W * 2 - 0.2, 0, false), trimMat, [FRONT_AXLE_X, AXLE_Y, 0], { outline: 0 });
	} else {
		// Only the wheel wells themselves, so the bay between them stays open.
		pair((side) => add(body, extrude(archFill(), 0.15, 0, false), trimMat, [FRONT_AXLE_X, AXLE_Y, side * 0.645], { outline: 0 }));
	}

	pair((side) => {
		const skin = side * (BODY_HALF_W + 0.004);
		// The body-side crease that runs from the front fender, through the door, along the bed.
		const creaseFrom = TAIL_X + 0.04;
		const creaseTo = NOSE_X - 0.08;
		// A lit upper edge over a dark shadow line, like light catching a stamped crease.
		// With opening doors, the door carries its own length of crease.
		const runs: [number, number][] = openable ? [[creaseFrom, DOOR_BACK_X], [DOOR_FRONT_X, creaseTo]] : [[creaseFrom, creaseTo]];
		for (const [a, b] of runs) {
			add(body, slab(b - a, 0.022, 0.014, 0.008, 0.005), creaseMat, [(a + b) / 2, 0.805, skin], { outline: 0 });
			add(body, slab(b - a, 0.012, 0.008, 0.004, 0.002), trimMat, [(a + b) / 2, 0.788, skin - side * 0.002], { outline: 0 });
		}
		// Seam between the cab and the bed.
		add(body, slab(0.02, BELT_Y - AXLE_Y, 0.02, 0.006, 0.003), trimMat, [CAB_BACK_X - 0.005, (AXLE_Y + BELT_Y) / 2, side * (BODY_HALF_W + 0.008)], {
			outline: 0,
		});
	});
	// Fuel door on the driver's side of the bed, ahead of the rear wheel.
	add(body, slab(0.15, 0.15, 0.012, 0.035, 0.004), bodyMat, [CAB_BACK_X - 0.3, 0.62, -(BODY_HALF_W + 0.004)], { outline: 0.008 });

	// --- Bed: hollow, built from walls, a recessed floor, wheel wells, headboard and tailgate ---
	const bedLen = CAB_BACK_X - TAIL_X;
	const bedMidX = (TAIL_X + CAB_BACK_X) / 2;
	pair((side) => {
		add(body, extrude(bedWallProfile(), 0.08, 0.02, false), bodyMat, [0, 0, side * (BODY_HALF_W - 0.04)], {
			outline: OUTLINE,
		});
		// Rolled top rail along the wall, with stake pockets at the corners and over the wheel.
		add(body, slab(bedLen, 0.05, 0.12, 0.02, 0.012), bodyMat, [bedMidX, BELT_Y, side * (BODY_HALF_W - 0.06)]);
		for (const x of [CAB_BACK_X - 0.14, REAR_AXLE_X, TAIL_X + 0.14]) {
			add(body, slab(0.07, 0.012, 0.04, 0.008, 0.003), trimMat, [x, BELT_Y + 0.026, side * (BODY_HALF_W - 0.06)], { outline: 0 });
		}
		// Wheel well intruding into the bed.
		add(body, slab(0.95, 0.24, 0.22, 0.1, 0.03), bedLined ? linerMat : bodyMat, [REAR_AXLE_X, BED_FLOOR_Y + 0.12, side * (BODY_HALF_W - 0.2)]);
		// Inside the wall: stamped vertical ribs and tie-down hooks under the rail.
		const innerZ = side * (BODY_HALF_W - 0.086);
		for (const x of [CAB_BACK_X - 0.32, CAB_BACK_X - 0.44, TAIL_X + 0.3, TAIL_X + 0.42]) {
			add(body, slab(0.04, 0.2, 0.012, 0.012, 0.004), bedLined ? linerMat : bodyMat, [x, BED_FLOOR_Y + 0.15, innerZ], { outline: 0.008 });
		}
		// LINE-X coats the inside of the wall up to the rail.
		if (bedLined) add(body, slab(bedLen - 0.1, BELT_Y - BED_FLOOR_Y - 0.03, 0.005, 0.004, 0.002), linerMat, [bedMidX, (BED_FLOOR_Y + BELT_Y - 0.03) / 2, side * (BODY_HALF_W - 0.083)], { outline: 0 });
		for (const x of [CAB_BACK_X - 0.2, TAIL_X + 0.2]) {
			add(body, new TorusGeometry(0.03, 0.007, 6, 12, Math.PI), silverMat, [x, BELT_Y - 0.1, innerZ - side * 0.01], { outline: 0 });
		}
	});
	// Dark underbody so the gap below the floor reads as frame, not sky.
	add(body, slab(bedLen, 0.3, BODY_HALF_W * 2 - 0.2, 0.02, 0.01), trimMat, [bedMidX, AXLE_Y + 0.15, 0], { outline: 0 });
	// Floor, sitting well below the rails, with stamped ribs.
	const floorMat = bedLined ? linerMat : bedFloorMat;
	add(body, slab(bedLen - 0.08, 0.05, BODY_HALF_W * 2 - 0.16, 0.01, 0.006), floorMat, [bedMidX, BED_FLOOR_Y - 0.025, 0], {
		outline: 0.02,
	});
	for (let i = 0; i < 8; i++) {
		add(body, slab(0.045, 0.025, BODY_HALF_W * 2 - 0.2, 0.008, 0.004), floorMat, [CAB_BACK_X - 0.2 - i * 0.24, BED_FLOOR_Y + 0.008, 0], {
			outline: 0,
		});
	}
	// Bed front wall at rail height, so the rear window stays clear: rolled cap and stamped ribs.
	const bedInnerW = BODY_HALF_W * 2 - 0.1;
	add(body, slab(0.07, BELT_Y - BED_FLOOR_Y + 0.02, bedInnerW, 0.02, 0.015), bodyMat, [CAB_BACK_X - 0.05, (BED_FLOOR_Y + BELT_Y) / 2, 0]);
	add(body, slab(0.12, 0.05, bedInnerW, 0.02, 0.012), bodyMat, [CAB_BACK_X - 0.06, BELT_Y, 0]).name = "bed-front-cap";
	for (const y of [BED_FLOOR_Y + 0.09, BED_FLOOR_Y + 0.19]) {
		add(body, slab(0.015, 0.035, bedInnerW - 0.24, 0.01, 0.004), bedLined ? linerMat : bodyMat, [CAB_BACK_X - 0.09, y, 0], { outline: 0.008 });
	}
	if (bedLined) add(body, slab(0.004, BELT_Y - BED_FLOOR_Y - 0.03, bedInnerW - 0.02, 0.002, 0.001), linerMat, [CAB_BACK_X - 0.087, (BED_FLOOR_Y + BELT_Y - 0.03) / 2, 0], { outline: 0 });

	// Tailgate, flush with the walls, as on 1989-91 US trucks: ribbed inside; outside, a chrome latch
	// handle in a recessed pocket at the top center, and below it a wide indented panel with TOYOTA
	// painted across it in white (not stamped, not separate chrome letters).
	// Openable, it hangs on a pivot at its bottom edge and drops toward the rear.
	const gate = openable ? new Group() : body;
	const gx = openable ? TAIL_X + 0.03 : 0;
	const gy = openable ? 0.5 : 0;
	if (openable) {
		gate.position.set(gx, gy, 0);
		body.add(gate);
		openers.tailgate = gate as Group;
	}
	add(gate, slab(0.07, 0.5, BODY_HALF_W * 2 - 0.08, 0.02, 0.015), bodyMat, [TAIL_X + 0.03 - gx, 0.75 - gy, 0], { outline: OUTLINE });
	for (const y of [0.62, 0.74, 0.86]) {
		add(gate, slab(0.012, 0.03, BODY_HALF_W * 2 - 0.3, 0.01, 0.004), bedLined ? linerMat : bodyMat, [TAIL_X + 0.071 - gx, y - gy, 0], { outline: 0.008 });
	}
	if (bedLined) add(gate, slab(0.004, 0.44, BODY_HALF_W * 2 - 0.12, 0.002, 0.001), linerMat, [TAIL_X + 0.067 - gx, 0.75 - gy, 0], { outline: 0 });
	const gateFace = TAIL_X - 0.005 - gx;
	// The indent: a shadowed panel ringed by a raised lip, so it reads as pressed in.
	const pan = GATE_PANEL;
	const panMidY = (pan.top + pan.bottom) / 2 - gy;
	add(gate, slab(0.004, pan.top - pan.bottom, pan.halfW * 2, 0.02, 0.001), recessMat, [gateFace - 0.001, panMidY, 0], { outline: 0 });
	for (const y of [pan.top, pan.bottom]) {
		add(gate, slab(0.012, 0.016, pan.halfW * 2 + 0.016, 0.006, 0.003), bodyMat, [gateFace - 0.004, y - gy, 0], { outline: 0.006 });
	}
	pair((side) => add(gate, slab(0.012, pan.top - pan.bottom, 0.016, 0.006, 0.003), bodyMat, [gateFace - 0.004, panMidY, side * pan.halfW], { outline: 0.006 }));
	if (options.tailgateLettering !== false) lettering("TOYOTA", [gateFace - 0.002, 0.7 - gy, 0], 0.11, 0.024, -1, letterPaintMat, gate);
	add(gate, slab(0.006, 0.07, 0.22, 0.02, 0.003), trimMat, [gateFace - 0.001, 0.94 - gy, 0], { outline: 0 }); // handle pocket
	add(gate, slab(0.022, 0.032, 0.17, 0.012, 0.006), chromeMat, [gateFace - 0.008, 0.94 - gy, 0], { outline: 0.008 }); // latch handle

	if (options.bed === "shell") {
		// Cab-high shell: its roof is level with the cab's, and it runs the full bed, painted to match.
		const shellTop = 1.63;
		const shellBase = BELT_Y + 0.026;
		const shellLen = CAB_BACK_X - 0.08 - (TAIL_X - 0.005);
		const shellMid = (CAB_BACK_X - 0.08 + TAIL_X - 0.005) / 2;
		const shellGlass = glassWith(0.3);
		add(body, slab(shellLen, shellTop - shellBase, BODY_HALF_W * 2 - 0.02, 0.07, 0.02), bodyMat, [shellMid, (shellTop + shellBase) / 2, 0], { outline: OUTLINE });
		pair((side) => {
			add(body, slab(shellLen - 0.42, 0.34, 0.012, 0.05, 0.004), shellGlass, [shellMid, shellBase + 0.33, side * (BODY_HALF_W - 0.006)], { outline: 0.01 });
		});
		add(body, slab(0.012, 0.42, BODY_HALF_W * 2 - 0.3, 0.05, 0.004), shellGlass, [TAIL_X - 0.011, shellBase + 0.32, 0], { outline: 0.01 });
		add(body, slab(0.03, 0.03, 0.2, 0.01, 0.005), trimMat, [TAIL_X - 0.02, shellBase + 0.07, 0], { outline: 0 }); // rear door latch
	} else if (options.bed === "tonneau") {
		// Soft roll-up cover stretched flat across the bed rails.
		add(body, slab(CAB_BACK_X - TAIL_X - 0.08, 0.025, BODY_HALF_W * 2 - 0.1, 0.01, 0.005), trimMat, [(CAB_BACK_X + TAIL_X) / 2 - 0.02, BELT_Y + 0.035, 0], {
			outline: OUTLINE_SMALL,
		});
	}

	// --- Flared lips on every wheel opening ---
	pair((side) => {
		for (const x of [FRONT_AXLE_X, REAR_AXLE_X]) {
			add(body, extrude(archLip(0.035), 0.04, 0.008, false), trimMat, [x, AXLE_Y, side * (BODY_HALF_W + 0.012)], { outline: 0 });
		}
	});

	// --- Cab greenhouse: transparent glass with an interior you can see through it ---
	const glassShape = new Shape();
	glassShape.moveTo(0.72, BELT_Y);
	glassShape.lineTo(0.12, 1.58);
	glassShape.lineTo(-0.5, 1.58);
	glassShape.lineTo(-0.6, BELT_Y);
	if (!openable && !options.glassVlt) {
		add(body, extrude(glassShape, 1.5, 0.02, false), glassMat, [0, 0, 0], { outline: 0 });
	} else {
		// Separate panes, so the side glass can ride with the doors and each window takes its own tint.
		add(body, slab(Math.hypot(0.6, 0.6), 0.012, 1.48, 0.005, 0.002), windshieldMat, [0.42, (BELT_Y + 1.58) / 2, 0], { rot: [0, 0, (3 * Math.PI) / 4], outline: 0 });
		add(body, slab(0.012, 0.6, 1.48, 0.005, 0.002), rearGlassMat, [-0.55, (BELT_Y + 1.58) / 2, 0], { rot: [0, 0, -0.165], outline: 0 });
		if (!openable) {
			pair((side) => {
				const pane = new Shape();
				pane.moveTo(0.7, BELT_Y + 0.01);
				pane.lineTo(0.13, 1.56);
				pane.lineTo(-0.5, 1.56);
				pane.lineTo(-0.58, BELT_Y + 0.01);
				add(body, extrude(pane, 0.012, 0.003, false), sideGlassMat, [0, 0, side * 0.765], { outline: 0 });
			});
		}
	}
	// Roof, slightly proud of the glass.
	add(body, slab(0.8, 0.06, 1.62, 0.03, 0.02), bodyMat, [-0.19, 1.6, 0], { outline: OUTLINE });
	// Sliding rear window: black frame along the raked rear glass, slider rails and a center latch.
	const rearRake = -0.165;
	const rearGlassX = (y: number) => -0.6 + ((y - BELT_Y) / (1.58 - BELT_Y)) * 0.1 - 0.012;
	add(body, slab(0.025, 0.025, 1.42, 0.008, 0.004), trimMat, [rearGlassX(BELT_Y + 0.03), BELT_Y + 0.03, 0], { outline: 0 });
	add(body, slab(0.025, 0.025, 1.42, 0.008, 0.004), trimMat, [rearGlassX(1.55), 1.55, 0], { outline: 0 });
	for (const z of [-0.26, 0.26]) {
		add(body, slab(0.025, 0.55, 0.025, 0.008, 0.004), trimMat, [rearGlassX(1.29), 1.29, z], { rot: [0, 0, rearRake], outline: 0 });
	}
	add(body, slab(0.02, 0.05, 0.05, 0.01, 0.004), silverMat, [rearGlassX(1.29) - 0.005, 1.29, 0], { rot: [0, 0, rearRake], outline: 0 });
	if (options.rack === "rollbar") {
		// Tube roll bar standing on the bed rails just behind the cab, braced back to the rails, with four
		// 6-inch KC Daylighters on top in KC's yellow covers (black logo), its black ones (white logo), or none.
		const rx = CAB_BACK_X - 0.3;
		const railY = BELT_Y + 0.03;
		const barTop = 1.72;
		const tube = (pts: [number, number, number][], closed = false) =>
			new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), closed, "catmullrom", 0.15), 48, 0.028, 10, false);
		add(
			body,
			tube([
				[rx, railY, -0.76],
				[rx, 1.45, -0.75],
				[rx, barTop - 0.04, -0.68],
				[rx, barTop, -0.45],
				[rx, barTop, 0.45],
				[rx, barTop - 0.04, 0.68],
				[rx, 1.45, 0.75],
				[rx, railY, 0.76],
			]),
			chromeMat,
			[0, 0, 0],
			{ outline: 0.01 },
		);
		pair((side) => {
			add(body, tube([[rx, barTop - 0.08, side * 0.7], [rx - 0.3, 1.3, side * 0.74], [rx - 0.62, railY, side * 0.76]]), chromeMat, [0, 0, 0], { outline: 0.01 });
			add(body, slab(0.14, 0.02, 0.1, 0.006, 0.003), chromeMat, [rx - 0.3, railY - 0.01, side * 0.76], { outline: 0.006 }); // rail plate
		});
		const kcR = 3 * INCH; // 6-inch Daylighter
		const kc = options.rackLights ?? "yellow";
		const coverMat = kc === "black" ? std("#121315", 0.45) : kcYellowMat;
		const logoMat = kc === "black" ? stickerInkMat : trimMat;
		for (const z of kc === "none" ? [] : [-0.51, -0.17, 0.17, 0.51]) {
			const housing = new CylinderGeometry(kcR, kcR * 0.85, 0.08, 28);
			housing.rotateZ(-Math.PI / 2);
			add(body, slab(0.03, 0.06, 0.03, 0.006, 0.003), trimMat, [rx, barTop + 0.05, z], { outline: 0 }); // bracket
			add(body, housing, trimMat, [rx, barTop + kcR + 0.04, z], { outline: 0.01 });
			const cover = new CylinderGeometry(kcR * 1.02, kcR * 1.02, 0.014, 28);
			cover.rotateZ(-Math.PI / 2);
			add(body, cover, coverMat, [rx + 0.046, barTop + kcR + 0.04, z], { outline: 0.006 });
			lettering("KC", [rx + 0.054, barTop + kcR + 0.04, z], 0.05, 0.011, 1, logoMat);
		}
	}

	// --- Steps under the doors, from just behind the front tire to the back of the cab ---
	const stepFrontX = 0.86;
	const stepBackX = CAB_BACK_X - 0.05;
	const stepY = DOOR_BOTTOM_Y - 0.08;
	if (options.steps === "tube") {
		// Westin Signature: a 3-inch round tube in black powder coat, its ends bent back to the body, on two
		// brackets, with a molded step pad under the door.
		const tubeR = 1.5 * INCH;
		const stepMat = std("#17181a", 0.45, 0.4);
		const padMat = std("#0b0b0c", 0.9);
		pair((side) => {
			const out = side * (BODY_HALF_W + 0.07);
			const inn = side * (BODY_HALF_W - 0.03);
			const path = new CatmullRomCurve3(
				[
					new Vector3(stepFrontX, stepY, inn),
					new Vector3(stepFrontX - 0.07, stepY, out),
					new Vector3(stepBackX + 0.07, stepY, out),
					new Vector3(stepBackX, stepY, inn),
				],
				false,
				"catmullrom",
				0.1,
			);
			add(body, new TubeGeometry(path, 40, tubeR, 12, false), stepMat, [0, 0, 0], { outline: 0.008 });
			for (const bx of [0.45, -0.35]) add(body, slab(0.06, 0.04, 0.12, 0.01, 0.004), stepMat, [bx, stepY + 0.02, side * (BODY_HALF_W + 0.01)], { outline: 0 });
			add(body, slab(0.34, 0.014, 0.075, 0.006, 0.003), padMat, [0.12, stepY + tubeR, out], { outline: 0 });
		});
	} else if (options.steps === "board") {
		// Toyota's chrome running board: a flat board with black rubber treads along it. Its width isn't
		// published; it is drawn 5.5 inches wide.
		const boardW = 5.5 * INCH;
		const treadMat = std("#111214", 0.85);
		pair((side) => {
			const z = side * (BODY_HALF_W - 0.02 + boardW / 2);
			add(body, slab(stepFrontX - stepBackX, 0.035, boardW, 0.012, 0.004), chromeMat, [(stepFrontX + stepBackX) / 2, stepY, z], { outline: 0.008 });
			for (const dz of [-0.04, 0, 0.04]) {
				add(body, slab(stepFrontX - stepBackX - 0.12, 0.008, 0.016, 0.003, 0.002), treadMat, [(stepFrontX + stepBackX) / 2, stepY + 0.021, z + dz * side], { outline: 0 });
			}
			for (const bx of [0.45, -0.35]) add(body, slab(0.05, 0.05, 0.1, 0.01, 0.004), trimMat, [bx, stepY + 0.035, side * (BODY_HALF_W - 0.02)], { outline: 0 });
		});
	} else if (options.steps === "slider") {
		// Trail-Gear APEX rock sliders: a rail of 1.75 in DOM tube under the rocker, an outer tube of the same
		// kicked out and up with its ends bent back to the rail, a steel fill plate between them, and 2 in
		// square legs in to the frame, all in black powder coat. 60 in long, about the cab's length. How far
		// the outer tube kicks out and up is estimated.
		const tubeR = (1.75 * INCH) / 2;
		const legW = 2 * INCH;
		const sliderMat = std("#16171a", 0.55, 0.35);
		const tube = (pts: Vector3[]) => new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0.08), 40, tubeR, 10, false);
		pair((side) => {
			const inZ = side * (BODY_HALF_W - 0.03);
			const outZ = side * (BODY_HALF_W + 0.09);
			const lowY = stepY - 0.02;
			const highY = stepY + 0.045;
			add(body, tube([new Vector3(stepFrontX, lowY, inZ), new Vector3(stepBackX, lowY, inZ)]), sliderMat, [0, 0, 0], { outline: 0.006 });
			add(
				body,
				tube([new Vector3(stepFrontX, lowY, inZ), new Vector3(stepFrontX - 0.1, highY, outZ), new Vector3(stepBackX + 0.1, highY, outZ), new Vector3(stepBackX, lowY, inZ)]),
				sliderMat,
				[0, 0, 0],
				{ outline: 0.008 },
			);
			const plateW = Math.hypot(outZ - inZ, highY - lowY);
			add(body, slab(stepFrontX - stepBackX - 0.24, 0.006, plateW, 0.002, 0.001), sliderMat, [(stepFrontX + stepBackX) / 2, (lowY + highY) / 2, (inZ + outZ) / 2], {
				rot: [-side * Math.atan2(highY - lowY, Math.abs(outZ - inZ)), 0, 0],
				outline: 0,
			});
			for (const bx of [0.55, 0.1, -0.4]) add(body, slab(legW, legW, 0.2, 0.004, 0.002), sliderMat, [bx, lowY, side * (BODY_HALF_W - 0.13)], { outline: 0 });
		});
	}

	// --- Exhaust ---
	const pipeR = 1.75 * INCH * 0.5;
	const pipeY = 0.31; // just under the rear bumper
	const pipeZ = -0.5; // driver's side, as on Kyle's truck
	const tailpipe = (endX: number) => {
		const len = TAIL_X + 0.9 - endX;
		const g = new CylinderGeometry(pipeR, pipeR, len, 14);
		g.rotateZ(Math.PI / 2);
		add(body, g, std("#55595d", 0.6, 0.6), [endX + len / 2, pipeY, pipeZ], { outline: 0 });
		// The open end, dark inside.
		const mouth = new CylinderGeometry(pipeR * 0.8, pipeR * 0.8, 0.004, 14);
		mouth.rotateZ(Math.PI / 2);
		add(body, mouth, trimMat, [endX - 0.001, pipeY, pipeZ], { outline: 0 });
	};
	if (options.exhaust === "factory") {
		tailpipe(TAIL_X - 0.06);
	} else if (options.exhaust === "tip") {
		// A plain round chrome tip, 1.75 in across and 5.25 in long, over the end of the factory pipe, its
		// mouth flush with the back of the bumper so it shows.
		const tipLen = 5.25 * INCH;
		const tipEnd = TAIL_X - 0.2;
		tailpipe(tipEnd + tipLen - 0.02);
		const tip = new CylinderGeometry(pipeR + 0.002, pipeR + 0.002, tipLen, 18, 1, true);
		tip.rotateZ(Math.PI / 2);
		add(body, tip, mirrorMat, [tipEnd + tipLen / 2, pipeY, pipeZ], { outline: 0.004 });
		const mouth = new CylinderGeometry(pipeR * 0.95, pipeR * 0.95, 0.004, 18);
		mouth.rotateZ(Math.PI / 2);
		add(body, mouth, trimMat, [tipEnd + 0.004, pipeY, pipeZ], { outline: 0 });
	} else if (options.exhaust === "turndown") {
		// Nickson's 1.75 in aluminized turndown, 12 in long, on the tailpipe cut short just ahead of the
		// driver's rear tire: the pipe runs back under the bed's side, then bends down and out toward the
		// ground. Where it's cut is estimated.
		const exitX = REAR_AXLE_X + ARCH_RX + 0.26; // so the bend ends just clear of the wheel opening
		const z = -(BODY_HALF_W - 0.14);
		const runFrom = CAB_BACK_X + 0.3;
		const run = new CylinderGeometry(pipeR, pipeR, runFrom - exitX, 14);
		run.rotateZ(Math.PI / 2);
		add(body, run, std("#55595d", 0.6, 0.6), [(runFrom + exitX) / 2, pipeY, z], { outline: 0 });
		const bend = new CatmullRomCurve3([new Vector3(exitX + 0.02, pipeY, z), new Vector3(exitX - 0.1, pipeY - 0.01, z - 0.02), new Vector3(exitX - 0.2, pipeY - 0.09, z - 0.07), new Vector3(exitX - 0.23, pipeY - 0.16, z - 0.09)]);
		add(body, new TubeGeometry(bend, 24, pipeR + 0.002, 14, false), std("#a3a6a9", 0.45, 0.7), [0, 0, 0], { outline: 0.004 });
		const mouth = new CylinderGeometry(pipeR * 0.9, pipeR * 0.9, 0.004, 14);
		const end = bend.getPoint(1);
		const dir = bend.getTangent(1);
		const m = add(body, mouth, trimMat, [end.x, end.y, end.z], { outline: 0 });
		m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
	} else if (options.exhaust === "stacks") {
		// Twin 5-inch chrome stacks, 36 inches long, standing in the front corners of the bed with their
		// tops cut at 45 degrees and the open side facing back, each clamped to the cab.
		const stackR = 2.5 * INCH;
		const stackLen = 36 * INCH;
		const stackX = CAB_BACK_X - 0.13;
		pair((side) => {
			const g = new CylinderGeometry(stackR, stackR, stackLen, 24, 1, true);
			// Mitered top: the front of the tube stays full length, the back is cut down by one diameter.
			const pos = g.attributes.position;
			for (let i = 0; i < pos.count; i++) {
				if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) - (stackR - pos.getX(i)));
			}
			g.computeVertexNormals();
			const z = side * 0.62;
			add(body, g, chromeMat, [stackX, BED_FLOOR_Y + stackLen / 2, z], { outline: 0.01 });
			// Dark throat a little way down so the open cut reads as a pipe.
			const throat = new CylinderGeometry(stackR * 0.92, stackR * 0.92, 0.006, 24);
			add(body, throat, trimMat, [stackX, BED_FLOOR_Y + stackLen - 2 * stackR - 0.03, z], { outline: 0 });
			// Clamp and brace back to the cab.
			for (const y of [BELT_Y + 0.08, BED_FLOOR_Y + stackLen - 0.3]) {
				add(body, new TorusGeometry(stackR + 0.004, 0.008, 6, 20), trimMat, [stackX, y, z], { rot: [Math.PI / 2, 0, 0], outline: 0 });
				add(body, slab(CAB_BACK_X - stackX - stackR, 0.02, 0.02, 0.004, 0.002), trimMat, [(stackX + stackR + CAB_BACK_X) / 2, y, z], { outline: 0 });
			}
		});
	}
	// Cargo rides in an open bed (lined or not), standing on the tops of the floor's stamped ribs.
	const bedOpen = !options.bed || options.bed === "none" || options.bed === "liner";
	const cargoFloorY = CARGO_FLOOR_Y;
	// Everything in the bed hangs off one group, named so it can be found.
	const cargoRoot = new Group();
	cargoRoot.name = "cargo";
	body.add(cargoRoot);
	if (bedOpen && cargo === "longboard") {
		// The longboard rests deck-down with its nose tip on the bed floor just behind the cab and its deck on
		// the tailgate's top edge, fin up, tail hanging out past the back of the truck. Its rocker and foil
		// put the deck a different distance below its straight axis at each station, so the two contacts
		// are solved together.
		const board = buildLongboard();
		boardDispose = board.dispose;
		const L = TC_LONGBOARD.lengthM;
		const p1 = new Vector2(CAB_BACK_X - 0.14, BED_FLOOR_Y + 0.03); // nose tip on the floor
		const p2 = new Vector2(TAIL_X + 0.03, 1.0 + 0.005); // deck on the tailgate's top edge
		const f1 = 0.995;
		let phi = Math.atan2(p1.y - p2.y, p1.x - p2.x);
		let c1 = p1.clone();
		for (let i = 0; i < 4; i++) {
			const n = new Vector2(-Math.sin(phi), Math.cos(phi));
			const f2 = f1 - p1.distanceTo(p2) / L;
			c1 = p1.clone().addScaledVector(n, deckOffsetAt(f1));
			const c2 = p2.clone().addScaledVector(n, deckOffsetAt(f2));
			phi = Math.atan2(c1.y - c2.y, c1.x - c2.x);
		}
		const axis = new Vector2(Math.cos(phi), Math.sin(phi));
		const center = c1.clone().addScaledVector(axis, -(f1 - 0.5) * L);
		board.group.position.set(center.x, center.y, 0.08);
		board.group.rotation.z = phi;
		cargoRoot.add(board.group);
	}
	if (bedOpen && cargo === "cooler") {
		// YETI's Tundra 110, 37.2 x 18 x 19.8 in outside, across the front of the bed with its front to the
		// tailgate. From YETI's photos: a white rotomolded body and a lid about a sixth of its height, a raised
		// panel on the front that narrows toward the bottom, two black rubber T-latches pulled up over the lid's
		// front edge, the black YETI nameplate under the lid, rope handles at the ends and black rubber feet.
		const [cl, cd, ch] = [37.2 * INCH, 18 * INCH, 19.8 * INCH];
		const white = std("#f2f2ee", 0.6, 0.02);
		const rubber = std("#18191b", 0.8, 0.05);
		const cooler = new Group();
		cooler.name = "cooler";
		cargoRoot.add(cooler);
		const cx = CAB_BACK_X - 0.11 - cd / 2;
		const front = cx - cd / 2; // the face toward the tailgate
		const lidH = ch / 6;
		const feetH = 0.012;
		const seamY = cargoFloorY + ch - lidH;
		for (const fx of [cx - cd / 2 + 0.05, cx + cd / 2 - 0.05]) {
			for (const fz of [-cl / 2 + 0.07, cl / 2 - 0.07]) add(cooler, slab(0.07, feetH, 0.09, 0.004, 0.002), rubber, [fx, cargoFloorY + feetH / 2, fz], { outline: 0 });
		}
		add(cooler, slab(cd, seamY - cargoFloorY - feetH, cl, 0.035, 0.012), white, [cx, (seamY + cargoFloorY + feetH) / 2, 0], { outline: OUTLINE_SMALL });
		add(cooler, slab(cd, lidH - 0.004, cl, 0.03, 0.012), white, [cx, seamY + 0.004 + (lidH - 0.004) / 2, 0], { outline: OUTLINE_SMALL });
		add(cooler, slab(cd - 0.01, 0.004, cl - 0.01, 0.0015, 0.001), std("#bdbdb6", 0.7), [cx, seamY + 0.002, 0], { outline: 0 }); // seam
		// The raised front panel: full width under the lid, its sides angling in toward the feet.
		const panelTop = seamY - 0.03;
		const panelBot = cargoFloorY + feetH + 0.04;
		const panel = new Shape([new Vector2(-cl * 0.43, panelTop), new Vector2(cl * 0.43, panelTop), new Vector2(cl * 0.33, panelBot), new Vector2(-cl * 0.33, panelBot)]);
		const panelGeo = new ShapeGeometry(panel);
		panelGeo.rotateY(-Math.PI / 2);
		add(cooler, panelGeo, std("#e9e9e4", 0.55, 0.02), [front - 0.002, 0, 0], { outline: 0 });
		for (const [a, b] of [
			[new Vector2(-cl * 0.43, panelTop), new Vector2(-cl * 0.33, panelBot)],
			[new Vector2(cl * 0.43, panelTop), new Vector2(cl * 0.33, panelBot)],
			[new Vector2(-cl * 0.33, panelBot), new Vector2(cl * 0.33, panelBot)],
		]) {
			const edge = add(cooler, slab(0.004, a.distanceTo(b), 0.004, 0.001, 0.0005), std("#c8c8c1", 0.6), [front - 0.003, (a.y + b.y) / 2, (a.x + b.x) / 2], { outline: 0 });
			edge.rotation.x = Math.atan2(b.x - a.x, b.y - a.y);
		}
		// Two black T-latches, from the body up over the lid's front edge, their T-handles at the top.
		for (const z of [-cl * 0.3, cl * 0.3]) {
			add(cooler, slab(0.012, 0.11, 0.03, 0.004, 0.002), rubber, [front - 0.006, seamY + 0.005, z], { outline: 0.004 });
			add(cooler, slab(0.016, 0.022, 0.07, 0.006, 0.003), rubber, [front - 0.008, seamY + lidH - 0.012, z], { outline: 0.004 });
		}
		// The black nameplate with YETI in white, centered under the lid.
		add(cooler, slab(0.006, 0.032, 0.12, 0.004, 0.002), rubber, [front - 0.003, seamY - 0.04, 0], { outline: 0 });
		lettering("YETI", [front + 0.004, seamY - 0.04, 0], 0.018, 0.0035, -1, stickerInkMat, cooler);
		// Rope handles hanging at each end, a molded grip on each rope.
		const ropeMat = std("#2c2c2a", 0.9);
		pair((side) => {
			const z = side * (cl / 2);
			const y = seamY - 0.04;
			const rope = new CatmullRomCurve3([
				new Vector3(cx - 0.08, y, z),
				new Vector3(cx - 0.06, y - 0.05, z + side * 0.03),
				new Vector3(cx + 0.06, y - 0.05, z + side * 0.03),
				new Vector3(cx + 0.08, y, z),
			]);
			add(cooler, new TubeGeometry(rope, 20, 0.006, 6, false), ropeMat, [0, 0, 0], { outline: 0 });
			const grip = new CylinderGeometry(0.012, 0.012, 0.1, 10);
			grip.rotateZ(Math.PI / 2);
			add(cooler, grip, rubber, [cx, y - 0.052, z + side * 0.03], { outline: 0 });
		});
	}
	if (bedOpen && cargo === "rubbish") {
		// Four 33-gallon black bags, tied off. Flat, each is 33 x 36.5 in, so 66 in around: about a 0.27 m radius
		// filled round. Three stand at the back of the bed and one lies on its side; each is filled, slumped and
		// bulged differently. Those shapes are estimates.
		const bagMat = std("#121315", 0.28, 0.05);
		const profile = [
			[0.001, 0],
			[0.17, 0.02],
			[0.235, 0.08],
			[0.25, 0.2],
			[0.24, 0.32],
			[0.19, 0.4],
			[0.1, 0.45],
			[0.035, 0.48],
			[0.03, 0.5],
			[0.022, 0.53],
			[0.001, 0.55],
		];
		/** One tied bag: the profile scaled by how full it is and how tall it stands, with lumps round it that fade out at the knot. */
		const bagGeo = (fill: number, tall: number, seed: number) => {
			const g = new LatheGeometry(
				profile.map(([r, y]) => new Vector2(r * fill, y * tall)),
				28,
			);
			const pos = g.attributes.position;
			const v = new Vector3();
			for (let i = 0; i < pos.count; i++) {
				v.fromBufferAttribute(pos, i);
				const a = Math.atan2(v.z, v.x);
				const t = v.y / (0.55 * tall);
				const fade = Math.sin(Math.PI * Math.min(1, t * 1.15));
				const k = 1 + fade * (0.06 * Math.sin(3 * a + seed) + 0.04 * Math.sin(5 * a + 2.1 * seed) + 0.03 * Math.sin(2 * a + 0.7 * seed + 4 * t));
				pos.setXYZ(i, v.x * k, v.y, v.z * k);
			}
			g.computeVertexNormals();
			return g;
		};
		const bags: { at: [number, number]; fill: number; tall: number; seed: number; lean: [number, number]; lying?: boolean }[] = [
			{ at: [TAIL_X + 0.37, -0.24], fill: 0.95, tall: 1.0, seed: 0.4, lean: [0.06, -0.05] },
			{ at: [TAIL_X + 0.4, 0.26], fill: 0.85, tall: 0.88, seed: 2.2, lean: [-0.08, -0.04] },
			{ at: [TAIL_X + 0.9, -0.25], fill: 1.0, tall: 1.08, seed: 4.1, lean: [0.04, 0.05] },
			{ at: [TAIL_X + 1.27, 0.265], fill: 0.85, tall: 0.95, seed: 5.3, lean: [0, 0], lying: true },
		];
		for (const b of bags) {
			const bag = new Group();
			const h = 0.55 * b.tall;
			// The widest a bag gets, lumps included.
			const widest = 0.25 * b.fill * 1.13;
			if (b.lying) {
				// On its side, knot toward the tailgate, sagging flat against the floor.
				bag.position.set(b.at[0], cargoFloorY + widest * 0.8, b.at[1]);
				bag.rotation.z = Math.PI / 2;
				bag.scale.set(0.8, 1, 1);
			} else {
				// Leaning lifts one edge of the base and would sink the other, so the bag rides up by that much.
				bag.position.set(b.at[0], cargoFloorY + widest * Math.sin(Math.abs(b.lean[0]) + Math.abs(b.lean[1])), b.at[1]);
				bag.rotation.set(b.lean[0], b.seed, b.lean[1]);
			}
			cargoRoot.add(bag);
			add(bag, bagGeo(b.fill, b.tall, b.seed), bagMat, [0, 0, 0], { outline: 0.006 });
			// The two ears of the knot, splayed differently on each bag.
			for (const t of [-1, 1]) add(bag, slab(0.05, 0.07, 0.005, 0.002, 0.001), bagMat, [0, h, t * 0.02], { rot: [t * (0.5 + 0.3 * Math.sin(b.seed * 3)), 0, 0.2 * Math.cos(b.seed)], outline: 0 });
		}
	}
	if (bedOpen && cargo === "ulua") {
		// Three PENN Battalion II Ulua rods, 13 ft in two pieces, broken down: each 6 ft 6 in half lies with its
		// thick end on the floor behind the cab and rests up on the tailgate's top edge, its tip just past it.
		// From PENN's photos, the butt half runs: stainless butt sleeve, black rubber grip, the reel seat between
		// silver trim rings (a conventional reel on top, drawn generic), fore grip, then a magenta band and gold
		// label on the black blank and its first wire guides. The tip half lies beside it, guides getting
		// smaller toward the tip. Where each sits along the rod is estimated from the photos.
		const half = (13 * 12 * INCH) / 2;
		const blankMat = std("#131416", 0.35, 0.35);
		const sleeveMat = std("#c9ccd0", 0.25, 0.85);
		const rubberMat = std("#1c1d1f", 0.9, 0.02);
		const magentaMat = std("#b02a6b", 0.45, 0.2);
		const goldMat = std("#b8913a", 0.35, 0.7);
		const along = (rod: Group, geo: BufferGeometry, mat: Material, y: number) => add(rod, geo, mat, [0, y, 0], { outline: 0 });
		const guide = (rod: Group, y: number, r: number, rodR: number) => {
			const ring = new TorusGeometry(r, 0.0016, 6, 14);
			ring.rotateX(Math.PI / 2);
			add(rod, ring, silverMat, [rodR + r + 0.004, y, 0], { outline: 0 });
			add(rod, slab(0.006, 0.02, 0.004, 0.001, 0.0005), silverMat, [rodR + 0.003, y, 0], { outline: 0 }); // foot
		};
		for (const z of [-0.32, -0.02, 0.28]) {
			for (const butt of [true, false]) {
				const zz = z + (butt ? 0 : 0.05);
				const start = new Vector3(CAB_BACK_X - 0.16, cargoFloorY + (butt ? 0.02 : 0.012), zz);
				const rest = new Vector3(TAIL_X + 0.03, 1.0 + (butt ? 0.012 : 0.008), zz);
				const rod = new Group();
				rod.position.copy(start);
				// Along the rod is local +Y; local +X is straight up off it, the reel's and the guides' side.
				rod.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), rest.sub(start).normalize());
				cargoRoot.add(rod);
				const [r0, r1] = butt ? [0.012, 0.008] : [0.008, 0.0025];
				add(rod, new CylinderGeometry(r1, r0, half, 10), blankMat, [0, half / 2, 0], { outline: 0.004 });
				const rAt = (y: number) => r0 + ((r1 - r0) * y) / half;
				if (!butt) {
					[0.3, 0.7, 1.1, 1.5, 1.85].forEach((y, i) => guide(rod, y, 0.008 - i * 0.0012, rAt(y)));
					along(rod, new CylinderGeometry(0.003, 0.003, 0.012, 8), silverMat, half - 0.006); // tip-top
					continue;
				}
				along(rod, new CylinderGeometry(0.0165, 0.0165, 0.24, 12), sleeveMat, 0.12);
				along(rod, new CylinderGeometry(0.0175, 0.0175, 0.6, 12), rubberMat, 0.54);
				along(rod, new CylinderGeometry(0.0155, 0.0155, 0.14, 12), silverMat, 0.91);
				for (const y of [0.845, 0.975]) along(rod, new CylinderGeometry(0.019, 0.019, 0.012, 14), sleeveMat, y);
				along(rod, new CylinderGeometry(0.0155, 0.017, 0.26, 12), rubberMat, 1.11);
				along(rod, new CylinderGeometry(rAt(1.32) + 0.0008, rAt(1.32) + 0.0008, 0.012, 10), magentaMat, 1.32);
				along(rod, new CylinderGeometry(rAt(1.41) + 0.0006, rAt(1.41) + 0.0006, 0.11, 10), goldMat, 1.41);
				for (const y of [1.6, 1.88]) guide(rod, y, 0.011, rAt(y));
				// The reel on top of the seat: spool, silver side plates and a foot.
				const spool = new CylinderGeometry(0.04, 0.04, 0.075, 18);
				spool.rotateX(Math.PI / 2);
				add(rod, spool, trimMat, [0.06, 0.91, 0], { outline: 0.006 });
				for (const side of [-1, 1]) {
					const plate = new CylinderGeometry(0.046, 0.046, 0.01, 18);
					plate.rotateX(Math.PI / 2);
					add(rod, plate, silverMat, [0.06, 0.91, side * 0.042], { outline: 0 });
				}
				add(rod, slab(0.03, 0.06, 0.02, 0.004, 0.002), silverMat, [0.03, 0.91, 0], { outline: 0 });
			}
		}
	}
	if (bedOpen && cargo === "dirtbike") {
		// Honda's CRF50F standing on its wheels down the middle of the bed, front wheel to the cab, strapped to
		// the front tie-downs. From Honda's sheet: 35.9 in wheelbase, 51.3 in long, 22.9 in across the bars,
		// 30.5 in tall, a 21.6 in seat, 6.0 in of ground clearance, 25 degrees of rake and 2.50-10 tires
		// (10 in rims, about 15 in tall). From Honda's studio photo: red plastics and seat, the white HONDA on
		// each side panel and CRF on the shrouds over a navy flash, a silver frame, swingarm and fork with red
		// guards, a high MX front fender, a red number plate, spoked wheels on knobby tires and the black
		// exhaust on the right. Panel shapes are simplified.
		const wb = 35.9 * INCH;
		const bikeLen = 51.3 * INCH;
		const barHalf = (22.9 * INCH) / 2;
		const bikeH = 30.5 * INCH;
		const seatH = 21.6 * INCH;
		const clearance = 6.0 * INCH;
		const rake = (25 * Math.PI) / 180;
		const tw = 2.5 * INCH;
		const wr = ((10 + 2 * 2.5) * INCH) / 2;
		const red = std("#d0202b", 0.4, 0.05);
		const seatRed = std("#a8121e", 0.85, 0.02);
		const frameMat = std("#b8bcc1", 0.35, 0.7);
		const blackPart = std("#151618", 0.6, 0.2);
		const tireMat = std("#141414", 0.9, 0);
		const navy = std("#1d2a5a", 0.5, 0.05);
		const bike = new Group();
		bike.name = "crf50f";
		bike.position.set(CAB_BACK_X - 0.12 - wr, cargoFloorY, 0); // origin: on the floor under the front axle
		cargoRoot.add(bike);
		/** Lettering on one side of the bike (side +1 is its right, +Z), reading front to back as seen from that side. */
		const sideLetters = (text: string, at: [number, number], z: number, height: number, side: 1 | -1) => {
			const g = new Group();
			g.position.set(at[0], at[1], side * z);
			g.rotation.y = -side * (Math.PI / 2);
			bike.add(g);
			lettering(text, [-0.008, 0, 0], height, height * 0.2, 1, stickerInkMat, g);
		};
		const tube = (pts: [number, number, number][], r: number, mat: Material) =>
			add(bike, new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), 24, r, 8, false), mat, [0, 0, 0], { outline: 0 });
		// Wheels: knobby tire, spoked silver rim and hub.
		for (const ax of [0, -wb]) {
			add(bike, new TorusGeometry(wr - tw / 2, tw / 2 - 0.006, 10, 28), tireMat, [ax, wr, 0], { outline: 0.006 });
			for (let i = 0; i < 22; i++) {
				const a = (i / 22) * Math.PI * 2;
				add(bike, slab(0.014, 0.018, tw * 0.85, 0.003, 0.002), tireMat, [ax + Math.cos(a) * (wr - 0.007), wr + Math.sin(a) * (wr - 0.007), 0], { rot: [0, 0, a], outline: 0 });
			}
			add(bike, new TorusGeometry(5 * INCH, 0.006, 6, 32), frameMat, [ax, wr, 0], { outline: 0 });
			const hub = new CylinderGeometry(0.03, 0.03, 0.07, 12);
			hub.rotateX(Math.PI / 2);
			add(bike, hub, frameMat, [ax, wr, 0], { outline: 0 });
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2;
				const z = i % 2 ? 0.02 : -0.02;
				const from = new Vector3(ax + Math.cos(a) * 0.028, wr + Math.sin(a) * 0.028, z);
				const to = new Vector3(ax + Math.cos(a + 0.4) * 5 * INCH, wr + Math.sin(a + 0.4) * 5 * INCH, 0);
				const spoke = add(bike, new CylinderGeometry(0.0016, 0.0016, from.distanceTo(to), 4), frameMat, [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2], { outline: 0 });
				spoke.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.sub(from).normalize());
			}
		}
		// Fork: silver legs raked back 25 degrees from the front axle to the steering head, red guards low on
		// their fronts, a black clamp on top.
		const barY = bikeH - 0.012;
		const forkLen = (barY - 0.06 - wr) / Math.cos(rake);
		const headX = -forkLen * Math.sin(rake);
		const fork = new Group();
		fork.position.set(0, wr, 0);
		fork.rotation.z = rake;
		bike.add(fork);
		for (const z of [-0.055, 0.055]) {
			add(fork, new CylinderGeometry(0.016, 0.016, forkLen, 10), frameMat, [0, forkLen / 2, z], { outline: 0 });
			add(fork, slab(0.03, 0.2, 0.012, 0.005, 0.002), red, [0.014, 0.14, z], { outline: 0 });
		}
		add(fork, slab(0.05, 0.03, 0.15, 0.008, 0.004), blackPart, [0, forkLen - 0.01, 0], { outline: 0 });
		// High MX front fender off the lower clamp, and the red number plate in front of the bars.
		const fenderAt = new Vector3(-0.72 * forkLen * Math.sin(rake), wr + 0.72 * forkLen * Math.cos(rake), 0);
		add(bike, slab(0.32, 0.012, 0.085, 0.005, 0.003), red, [fenderAt.x + 0.08, fenderAt.y - 0.01, 0], { rot: [0, 0, -0.18], outline: OUTLINE_SMALL });
		add(bike, slab(0.012, 0.11, 0.13, 0.004, 0.002), red, [headX + 0.05, barY - 0.085, 0], { rot: [0, 0, rake], outline: 0.004 });
		// Handlebar, 22.9 in across, black grips at the ends, its top at the bike's 30.5 in.
		const bar = new CatmullRomCurve3([
			new Vector3(headX - 0.05, barY - 0.008, -barHalf),
			new Vector3(headX - 0.02, barY, -0.12),
			new Vector3(headX - 0.015, barY + 0.002, 0),
			new Vector3(headX - 0.02, barY, 0.12),
			new Vector3(headX - 0.05, barY - 0.008, barHalf),
		]);
		add(bike, new TubeGeometry(bar, 30, 0.011, 8, false), blackPart, [0, 0, 0], { outline: 0.004 });
		for (const side of [-1, 1]) {
			const grip = new CylinderGeometry(0.0135, 0.0135, 0.09, 10);
			grip.rotateX(Math.PI / 2);
			add(bike, grip, tireMat, [headX - 0.048, barY - 0.007, side * (barHalf - 0.045)], { outline: 0 });
		}
		add(bike, slab(0.04, 0.06, 0.06, 0.008, 0.004), blackPart, [headX - 0.01, barY - 0.04, 0], { outline: 0 }); // clamp
		// Silver frame: backbone and down tube from the head, a cradle under the engine, seat rails back to the tail.
		const seatFront = headX - 0.24;
		const tailX = wr - bikeLen;
		tube([[headX - 0.01, barY - 0.1, 0], [headX - 0.12, seatH - 0.02, 0], [headX - 0.3, seatH - 0.09, 0], [headX - 0.33, clearance + 0.12, 0]], 0.012, frameMat);
		tube([[headX + 0.005, barY - 0.12, 0], [headX - 0.02, clearance + 0.12, 0], [headX - 0.1, clearance + 0.012, 0], [headX - 0.3, clearance + 0.012, 0], [headX - 0.33, clearance + 0.12, 0]], 0.012, frameMat);
		for (const z of [-0.05, 0.05]) tube([[headX - 0.28, seatH - 0.07, z], [tailX + 0.2, seatH - 0.05, z]], 0.008, frameMat);
		// Red tank and shrouds, a red seat with its top at 21.6 in, red side panels and tail out to the bike's full length.
		add(bike, slab(0.15, 0.17, 0.25, 0.03, 0.01), red, [headX - 0.08, seatH + 0.02, 0], { outline: OUTLINE_SMALL });
		add(bike, slab(0.24, 0.12, 0.19, 0.04, 0.012), red, [headX - 0.2, seatH + 0.04, 0], { outline: OUTLINE_SMALL });
		add(bike, slab(seatFront - (tailX + 0.22), 0.06, 0.17, 0.025, 0.01), seatRed, [(seatFront + tailX + 0.22) / 2, seatH - 0.03, 0], { outline: OUTLINE_SMALL });
		add(bike, slab(0.3, 0.035, 0.15, 0.012, 0.006), red, [tailX + 0.15, seatH - 0.04, 0], { rot: [0, 0, -0.08], outline: OUTLINE_SMALL });
		add(bike, slab(0.24, 0.13, 0.2, 0.02, 0.008), red, [seatFront - 0.26, seatH - 0.12, 0], { outline: 0.006 }); // side panels
		// Decals: a navy flash with CRF in white on each shroud, and HONDA in white on each side panel.
		for (const side of [-1, 1] as const) {
			add(bike, slab(0.12, 0.045, 0.003, 0.002, 0.001), navy, [headX - 0.085, seatH - 0.002, side * 0.1265], { rot: [0, 0, 0.35], outline: 0 });
			sideLetters("CRF", [headX - 0.085, seatH + 0.0], 0.125 + 0.005, 0.034, side);
			sideLetters("HONDA", [seatFront - 0.27, seatH - 0.12], 0.1 + 0.005, 0.03, side);
		}
		// Engine low between the wheels, its underside at the 6.0 in clearance: a silver case and the black,
		// near-level cylinder up front; footpegs either side; the silver swingarm back to the rear axle.
		add(bike, slab(0.24, 0.2, 0.17, 0.03, 0.01), std("#a3a7ac", 0.45, 0.6), [headX - 0.17, clearance + 0.1, 0], { outline: 0.006 });
		add(bike, slab(0.11, 0.09, 0.12, 0.012, 0.005), blackPart, [headX - 0.06, clearance + 0.17, 0], { rot: [0, 0, 0.5], outline: 0 });
		for (const side of [-1, 1]) {
			const peg = new CylinderGeometry(0.01, 0.01, 0.07, 8);
			peg.rotateX(Math.PI / 2);
			add(bike, peg, blackPart, [headX - 0.33, clearance + 0.1, side * 0.12], { outline: 0 });
		}
		for (const z of [-0.06, 0.06]) {
			const pivot = new Vector3(headX - 0.33, clearance + 0.13, z);
			const axle = new Vector3(-wb, wr, z);
			const arm = add(bike, new CylinderGeometry(0.014, 0.014, pivot.distanceTo(axle), 8), frameMat, [(pivot.x + axle.x) / 2, (pivot.y + axle.y) / 2, z], { outline: 0 });
			arm.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axle.clone().sub(pivot).normalize());
		}
		// Exhaust on the right: header from the cylinder, back under the seat to a black muffler by the tail.
		tube([[headX - 0.02, clearance + 0.14, 0.07], [headX - 0.3, seatH - 0.2, 0.11], [tailX + 0.4, seatH - 0.13, 0.11]], 0.016, blackPart);
		const muffler = new CylinderGeometry(0.03, 0.03, 0.2, 12);
		muffler.rotateZ(Math.PI / 2);
		add(bike, muffler, blackPart, [tailX + 0.3, seatH - 0.13, 0.11], { outline: 0.004 });
		// Ratchet straps from each end of the bars down to the front tie-down hooks.
		pair((side) => {
			const from = new Vector3(bike.position.x + headX - 0.04, bike.position.y + barY, side * (barHalf - 0.05));
			const to = new Vector3(CAB_BACK_X - 0.2, BELT_Y - 0.1, side * (BODY_HALF_W - 0.1));
			const strap = add(cargoRoot, slab(0.004, from.distanceTo(to), 0.025, 0.001, 0.0005), trimMat, [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2], { outline: 0 });
			strap.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
		});
	}
	/** A sticker's own frame on the outside of the raked rear glass, centered at (centerY, z); local -X faces out. */
	const onRearGlass = (name: string, z: number, centerY: number) => {
		const g = new Group();
		g.name = name;
		g.position.set(rearGlassX(centerY) - 0.004, centerY, z);
		g.rotation.z = rearRake;
		body.add(g);
		return g;
	};
	/** A flat piece of a sticker, drawn in its face (x across, y up), pressed on in layers so each sits just over the one below. */
	const decal = (parent: Object3D, geo: BufferGeometry, mat: Material, layer: number, at: [number, number] = [0, 0]) => {
		geo.rotateY(-Math.PI / 2);
		return add(parent, geo, mat, [-0.003 - layer * 0.0004, at[1], at[0]], { outline: 0 });
	};
	const rect = (w: number, h: number) => new ShapeGeometry(new Shape([new Vector2(-w / 2, -h / 2), new Vector2(w / 2, -h / 2), new Vector2(w / 2, h / 2), new Vector2(-w / 2, h / 2)]));
	// Every sticker goes in the same spot: the bottom corner of the rear glass on the passenger side (+Z),
	// the bottom right seen from behind, 0.75 in inside the glass that shows on both edges. Only code can
	// ask for more than one at once; any after the first line up inboard of it.
	// The glass that actually shows stops short of the window frame: the C pillar's black outline covers
	// its outboard edge, and the bed's front-wall cap (with its outline) covers its bottom.
	const cornerGap = 0.75 * INCH;
	const glassEdgeZ = 0.77 - 0.07 / 2 - OUTLINE_SMALL;
	const glassBottomY = BELT_Y + 0.05 / 2 + OUTLINE_SMALL;
	const stickerBottomY = glassBottomY + cornerGap;
	let stickerEdgeZ = glassEdgeZ - cornerGap;
	/** The frame for the next sticker, w across and h tall (real size), its outboard bottom corner at the corner. */
	const atCorner = (name: string, w: number, h: number) => {
		const [dw, dh] = [w * STICKER_DRAW_SCALE, h * STICKER_DRAW_SCALE];
		const g = onRearGlass(name, stickerEdgeZ - dw / 2, stickerBottomY + dh / 2);
		g.scale.setScalar(STICKER_DRAW_SCALE);
		stickerEdgeZ -= dw + cornerGap;
		return g;
	};
	if (stickers.includes("kalapana")) {
		// Aloha Got Soul's 7.5 x 2.5 in sticker, white on green. Only the big KALAPANA is lettered; the
		// "SLOW DOWN... I'M LISTENING TO" line above it would be about a millimeter tall at this scale.
		const [w, h] = [7.5 * INCH, 2.5 * INCH];
		const sticker = atCorner("sticker-kalapana", w, h);
		add(sticker, slab(0.005, h, w, 0.004, 0.001), stickerMat, [0, 0, 0], { outline: 0.003 });
		lettering("KALAPANA", [-0.004, -0.008, 0], 0.021, 0.0042, -1, stickerInkMat, sticker);
	}
	if (stickers.includes("tc")) {
		// T&C Surf Designs' 6 in Standard Logo, white on clear: the ring that carries "T&C Surf Designs" and
		// "Hawaii" (too small to letter here) round a yin-yang whose other half is the clear film. The ring is
		// about a third of the radius, as in T&C's product photo.
		const R = TC_STICKER_R;
		const sticker = atCorner("sticker-tc", 2 * R, 2 * R);
		decal(sticker, new RingGeometry(R * 0.68, R, 40), stickerInkMat, 0);
		const ry = R * 0.6;
		const yin = new Shape();
		yin.moveTo(0, ry);
		yin.absarc(0, 0, ry, Math.PI / 2, (3 * Math.PI) / 2, false);
		yin.absarc(0, -ry / 2, ry / 2, -Math.PI / 2, Math.PI / 2, false);
		yin.absarc(0, ry / 2, ry / 2, -Math.PI / 2, Math.PI / 2, true);
		const eye = new Shape();
		eye.absarc(0, -ry / 2, ry * 0.15, 0, Math.PI * 2, true);
		yin.holes.push(eye);
		decal(sticker, new ShapeGeometry(yin, 16), stickerInkMat, 0);
		decal(sticker, new CircleGeometry(ry * 0.15, 16), stickerInkMat, 0, [0, ry / 2]);
	}
	if (stickers.includes("lemon")) {
		// The lemon from Lemon's logo, die-cut to its outline (no square, no mark): a black rim round a yellow
		// slice, the rind set off by a black line round its lower left, and nine segments meeting just up and
		// right of center, black showing between them. About 4 in across, an estimate.
		const R = 2 * INCH;
		const sticker = atCorner("sticker-lemon", 2 * R, 2 * R);
		const ink = std("#141414", 0.5, 0);
		const lemon = std("#f5e23c", 0.45, 0);
		decal(sticker, new CircleGeometry(R, 40), ink, 0);
		decal(sticker, new CircleGeometry(R * 0.92, 40), lemon, 1);
		decal(sticker, new RingGeometry(R * 0.76, R * 0.82, 32, 1, Math.PI * 0.55, Math.PI * 1.05), ink, 2);
		const c: [number, number] = [R * 0.06, R * 0.06];
		decal(sticker, new CircleGeometry(R * 0.66, 36), ink, 2, c);
		for (let i = 0; i < 9; i++) {
			const a0 = (i / 9) * Math.PI * 2 + 0.07;
			const a1 = ((i + 1) / 9) * Math.PI * 2 - 0.07;
			const mid = (a0 + a1) / 2;
			const seg = new Shape();
			seg.moveTo(Math.cos(mid) * R * 0.11, Math.sin(mid) * R * 0.11);
			seg.lineTo(Math.cos(a0) * R * 0.6, Math.sin(a0) * R * 0.6); // an arc after a bare moveTo wouldn't join it
			seg.absarc(0, 0, R * 0.6, a0, a1, false);
			decal(sticker, new ShapeGeometry(seg, 8), lemon, 3, c);
		}
		decal(sticker, new CircleGeometry(R * 0.08, 12), ink, 4, c);
	}
	if (stickers.includes("kanaka")) {
		// Flags For Good's 3.75 x 2.5 in Kanaka Maoli flag sticker, white-bordered: nine
		// stripes, green, red and yellow from the top, and a green shield (darker rim) carrying a yellow kahili
		// on its staff and two paddles crossed below it, blades up and out.
		const [w, h] = [3.75 * INCH, 2.5 * INCH];
		const sticker = atCorner("sticker-kanaka", w, h);
		const green = std("#3fae49", 0.5, 0);
		const red = std("#e2312b", 0.5, 0);
		const yellow = std("#f5df35", 0.5, 0);
		decal(sticker, rect(w, h), stickerInkMat, 0);
		const [fw, fh] = [w - 0.004, h - 0.004];
		[green, red, yellow, green, red, yellow, green, red, yellow].forEach((m, i) => decal(sticker, rect(fw, fh / 9), m, 1, [0, fh / 2 - (fh / 9) * (i + 0.5)]));
		const sw = fw * 0.38;
		const sh = fh * 0.86;
		const shield = (k: number) => {
			const p = new Shape();
			const hw = (sw / 2) * k;
			p.moveTo(-hw, sh * 0.46 * k);
			p.lineTo(hw, sh * 0.46 * k);
			p.lineTo(hw, -sh * 0.08 * k);
			p.quadraticCurveTo(hw, -sh * 0.42 * k, 0, -sh * 0.54 * k);
			p.quadraticCurveTo(-hw, -sh * 0.42 * k, -hw, -sh * 0.08 * k);
			return new ShapeGeometry(p, 10);
		};
		decal(sticker, shield(1), std("#1f6a2c", 0.5, 0), 2);
		decal(sticker, shield(0.9), green, 3);
		decal(sticker, new ShapeGeometry(new Shape([new Vector2(-sw * 0.2, sh * 0.36), new Vector2(sw * 0.2, sh * 0.36), new Vector2(0, sh * 0.13)])), yellow, 4);
		decal(sticker, rect(sw * 0.05, sh * 0.52), yellow, 4, [0, -sh * 0.12]);
		for (const s of [-1, 1]) {
			const blade = new Shape();
			blade.absellipse(0, sh * 0.21, sh * 0.04, sh * 0.11, 0, Math.PI * 2, false, 0);
			const bladeGeo = new ShapeGeometry(blade, 12);
			bladeGeo.rotateZ(-s * 0.75);
			decal(sticker, bladeGeo, yellow, 4, [0, -sh * 0.12]);
			const shaft = rect(sw * 0.035, sh * 0.5);
			shaft.translate(0, -sh * 0.05, 0);
			shaft.rotateZ(-s * 0.75);
			decal(sticker, shaft, yellow, 4, [0, -sh * 0.12]);
		}
	}
	if (stickers.includes("dahui")) {
		// The Hui O He'e Nalu (Da Hui) badge from the Da Hui Paddle Race: a black disc ringed in
		// yellow with a yellow surfer at its center. The ring lettering is too small to draw at this scale, and
		// the surfer is simplified to a few strokes. About 4 in across, an estimate.
		const R = 2 * INCH;
		const sticker = atCorner("sticker-dahui", 2 * R, 2 * R);
		const black = std("#111111", 0.5, 0);
		const yellow = std("#f3d41c", 0.45, 0);
		decal(sticker, new CircleGeometry(R, 40), black, 0);
		decal(sticker, new RingGeometry(R * 0.9, R * 0.95, 40), yellow, 1);
		decal(sticker, new CircleGeometry(R * 0.08, 14), yellow, 1, [R * 0.04, R * 0.38]); // head
		const stroke = (len: number, angle: number, at: [number, number]) => {
			const g = rect(R * 0.07, len);
			g.rotateZ(angle);
			decal(sticker, g, yellow, 1, at);
		};
		stroke(R * 0.32, -0.2, [R * 0.01, R * 0.15]); // body
		stroke(R * 0.5, 1.2, [R * 0.0, R * 0.22]); // arms out
		stroke(R * 0.3, 0.55, [-R * 0.1, -R * 0.13]); // back leg
		stroke(R * 0.3, -0.45, [R * 0.12, -R * 0.13]); // front leg
		const board = new Shape();
		board.absellipse(0, 0, R * 0.42, R * 0.055, 0, Math.PI * 2, false, 0);
		const boardGeo = new ShapeGeometry(board, 16);
		boardGeo.rotateZ(0.12);
		decal(sticker, boardGeo, yellow, 1, [R * 0.01, -R * 0.34]);
	}

	pair((side) => {
		// A pillar follows the windshield rake; C pillar leans back with the rear window.
		add(body, slab(Math.hypot(0.6, 0.6), 0.07, 0.07, 0.02, 0.01), bodyMat, [0.42, (BELT_Y + 1.58) / 2, side * 0.77], {
			rot: [0, 0, (3 * Math.PI) / 4],
		});
		add(body, slab(0.09, 0.62, 0.07, 0.02, 0.01), bodyMat, [-0.55, (BELT_Y + 1.58) / 2, side * 0.77], { rot: [0, 0, -0.165] });
		if (!openable) {
			// Door window frame divider.
			add(body, slab(0.045, 0.6, 0.05, 0.015, 0.008), bodyMat, [-0.2, (BELT_Y + 1.58) / 2, side * 0.77], { outline: 0.02 });
			// Door seams and handle.
			for (const x of [DOOR_FRONT_X, DOOR_BACK_X]) {
				add(body, slab(0.022, 0.52, 0.02, 0.008, 0.004), trimMat, [x, 0.7, side * (BODY_HALF_W + 0.012)], { outline: 0 });
			}
			add(body, slab(0.14, 0.04, 0.04, 0.015, 0.008), trimMat, [-0.34, 0.9, side * (BODY_HALF_W + 0.025)], { outline: 0 });
		}
		// Mirror on a stalk.
		add(body, slab(0.06, 0.05, 0.16, 0.02, 0.008), trimMat, [0.74, 1.14, side * 0.89], { outline: 0 });
		add(body, slab(0.07, 0.24, 0.12, 0.03, 0.012), trimMat, [0.74, 1.24, side * 0.99], { outline: 0.02 });
	});

	// --- Interior. The driver sits on the left (-Z), US market. ---
	const inner = { outline: 0 };
	// Carpet, kick panel at the firewall, and trim on the inside of the back wall.
	add(body, slab(cabLen - 0.1, 0.03, cabInnerW, 0.01, 0.005), carpetMat, [cabMidX, CAB_FLOOR_Y + 0.015, 0], inner);
	add(body, slab(0.04, BELT_Y - CAB_FLOOR_Y, cabInnerW, 0.01, 0.005), carpetMat, [CAB_FRONT_X - 0.03, (CAB_FLOOR_Y + BELT_Y) / 2, 0], inner);
	add(body, slab(0.02, BELT_Y - CAB_FLOOR_Y - 0.04, cabInnerW, 0.01, 0.005), interiorMat, [CAB_BACK_X + 0.07, (CAB_FLOOR_Y + BELT_Y) / 2, 0], inner);
	pair((side) => {
		if (!openable) {
			// Door panel with an armrest and an inside handle (an opening door carries its own).
			const panelZ = side * (BODY_HALF_W - 0.09);
			add(body, slab(cabLen - 0.12, BELT_Y - CAB_FLOOR_Y - 0.04, 0.02, 0.02, 0.008), interiorMat, [cabMidX, (CAB_FLOOR_Y + BELT_Y) / 2, panelZ], inner);
			add(body, slab(0.34, 0.05, 0.07, 0.02, 0.01), dashMat, [0.02, 0.8, side * (BODY_HALF_W - 0.13)], inner);
			add(body, slab(0.08, 0.025, 0.02, 0.008, 0.004), silverMat, [0.42, 0.9, side * (BODY_HALF_W - 0.105)], inner);
		}
		// Sun visors, folded up against the headliner.
		add(body, slab(0.16, 0.02, 0.5, 0.02, 0.008), headlinerMat, [0.06, 1.535, side * 0.38], { rot: [0, 0, 0.08], outline: 0 });
	});

	// Dash: main slab, instrument hood with a gauge face over the steering wheel, vents, glovebox seam.
	add(body, slab(0.36, 0.16, cabInnerW, 0.05, 0.02), dashMat, [0.5, BELT_Y - 0.01, 0], inner);
	add(body, slab(0.14, 0.08, 0.5, 0.03, 0.012), trimMat, [0.44, BELT_Y + 0.1, -0.38], inner);
	add(body, slab(0.01, 0.055, 0.4, 0.02, 0.004), headlinerMat, [0.37, BELT_Y + 0.08, -0.38], inner);
	for (const z of [-0.06, 0.06]) {
		add(body, slab(0.01, 0.05, 0.09, 0.012, 0.004), trimMat, [0.315, BELT_Y + 0.02, z], inner);
	}
	add(body, slab(0.01, 0.012, 0.36, 0.004, 0.002), trimMat, [0.315, BELT_Y - 0.05, 0.38], inner);

	// Bench seat: cushion, reclined back with stitched pleats, and two headrests.
	add(body, slab(0.5, 0.15, cabInnerW - 0.06, 0.06, 0.03), seatMat, [-0.15, CAB_FLOOR_Y + 0.21, 0], inner);
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
	body.add(seatBack);

	// Floor shifter for the 5-speed: boot, stick, knob.
	add(body, slab(0.12, 0.04, 0.12, 0.04, 0.015), trimMat, [0.26, CAB_FLOOR_Y + 0.05, 0], inner);
	const stick = new CylinderGeometry(0.012, 0.012, 0.38, 8);
	add(body, stick, silverMat, [0.24, CAB_FLOOR_Y + 0.24, 0], { rot: [0, 0, 0.12], outline: 0 });
	const knob = new CylinderGeometry(0.035, 0.03, 0.06, 12);
	add(body, knob, trimMat, [0.22, CAB_FLOOR_Y + 0.44, 0], inner);

	// Headliner under the roof, and a rear-view mirror at the top of the windshield.
	add(body, slab(0.64, 0.02, cabInnerW, 0.01, 0.005), headlinerMat, [-0.19, 1.555, 0], inner);
	add(body, slab(0.02, 0.06, 0.03, 0.008, 0.004), trimMat, [0.14, 1.52, 0], inner);
	add(body, slab(0.03, 0.06, 0.22, 0.02, 0.008), trimMat, [0.15, 1.47, 0], inner);

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
	body.add(steering);

	// --- Front end: the US-market 1989-91 pickup, not the Hilux sold elsewhere ---
	// One lamp band runs the full width under the hood's leading edge: corner lamp, 7x6-inch sealed-beam
	// headlight, a black grille with chrome TOYOTA letters, then the mirror image. Below it, a chrome
	// bumper with amber turn lamps, and a body-color valance with slots. (The Hilux of the same years
	// had a gray plastic bumper and all-clear corner lamps; the US truck's corner lamps carry an amber
	// side-marker section that wraps onto the fender.)
	const bandY = FRONT.bandY;
	const bandX = NOSE_X + 0.012;
	add(body, slab(0.05, FRONT.bandH, BODY_HALF_W * 2 - 0.04, 0.02, 0.01), surroundMat, [NOSE_X - 0.005, bandY, 0], { outline: 0.02 });
	// Grille insert: five dark slots between four bars, split into thirds by two vertical posts.
	const grilleW = FRONT.grilleHalfW * 2;
	add(body, slab(0.02, FRONT.bandH - 0.03, grilleW, 0.006, 0.003), trimMat, [bandX + 0.004, bandY, 0], { outline: 0 });
	for (let i = 0; i < 4; i++) {
		const y = bandY - FRONT.bandH / 2 + 0.015 + ((i + 1) * (FRONT.bandH - 0.03)) / 5;
		add(body, slab(0.022, 0.012, grilleW - 0.02, 0.004, 0.002), grilleMat, [bandX + 0.01, y, 0], { outline: 0 });
	}
	for (const z of [-FRONT.grilleHalfW * 0.48, FRONT.grilleHalfW * 0.48]) {
		add(body, slab(0.026, FRONT.bandH - 0.03, 0.022, 0.006, 0.003), grilleMat, [bandX + 0.012, bandY, z], { outline: 0 });
	}
	lettering("TOYOTA", [bandX + 0.03, bandY, 0], 0.062, 0.014, 1, options.grille === "blackout" ? trimMat : silverMat);
	pair((side) => {
		// Sealed-beam headlight in a dark bezel, centered between the grille and the corner lamp.
		const headZ = side * FRONT.headZ;
		add(body, slab(0.03, FRONT.headH + 0.03, FRONT.headW + 0.03, 0.012, 0.006), surroundMat, [bandX + 0.004, bandY, headZ], { outline: 0 });
		if (options.headlights === "led") {
			// A 7x6 LED unit in the same opening: dark housing, three rows of five LED lenses.
			add(body, slab(0.04, FRONT.headH, FRONT.headW, 0.02, 0.012), ledHousingMat, [bandX + 0.014, bandY, headZ], { outline: 0.012 });
			for (let r = 0; r < 3; r++) {
				for (let c = 0; c < 5; c++) {
					const dot = new CylinderGeometry(0.011, 0.011, 0.008, 12);
					dot.rotateZ(Math.PI / 2);
					add(body, dot, headMat, [bandX + 0.036, bandY + (r - 1) * 0.038, headZ + (c - 2) * 0.034], { outline: 0 });
				}
			}
		} else if (options.headlights === "h4" || options.headlights === "retro") {
			// A clear lens over a chrome reflector, so the lamp reads as a bright bowl: an H4 bulb under its
			// shield cap at the center (Hella), or a small black LED module with its emitter (RetroBright).
			add(body, slab(0.03, FRONT.headH, FRONT.headW, 0.02, 0.012), reflectorMat, [bandX + 0.008, bandY, headZ], { outline: 0.012 });
			if (options.headlights === "h4") {
				const bulb = new CylinderGeometry(0.011, 0.011, 0.03, 12);
				bulb.rotateZ(Math.PI / 2);
				add(body, bulb, headMat, [bandX + 0.03, bandY, headZ], { outline: 0 });
				const cap = new CylinderGeometry(0.013, 0.013, 0.006, 12);
				cap.rotateZ(Math.PI / 2);
				add(body, cap, silverMat, [bandX + 0.047, bandY, headZ], { outline: 0 });
			} else {
				add(body, slab(0.02, 0.05, 0.06, 0.008, 0.004), ledHousingMat, [bandX + 0.03, bandY, headZ], { outline: 0 });
				const emitter = new CylinderGeometry(0.013, 0.013, 0.006, 14);
				emitter.rotateZ(Math.PI / 2);
				add(body, emitter, headMat, [bandX + 0.042, bandY, headZ], { outline: 0 });
			}
			add(body, slab(0.006, FRONT.headH - 0.006, FRONT.headW - 0.006, 0.012, 0.002), glassWith(0.9), [bandX + 0.052, bandY, headZ], { outline: 0 });
		} else {
			add(body, slab(0.04, FRONT.headH, FRONT.headW, 0.02, 0.012), headMat, [bandX + 0.014, bandY, headZ], { outline: 0.012 });
		}
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
		add(body, extrude(lens([[0, -h / 2], [FRONT.cornerBotW - amberW, -h / 2], [FRONT.cornerTopW - amberW, h / 2], [0, h / 2]]), 0.035, 0.006, false), headMat, [lensX, bandY, side * zIn], {
			...face,
			outline: 0.01,
		});
		add(body, extrude(lens([[FRONT.cornerBotW - amberW, -h / 2], [uSide, -h / 2], [uSide, h / 2], [FRONT.cornerTopW - amberW, h / 2]]), 0.035, 0.006, false), amberMat, [lensX, bandY, side * zIn], {
			...face,
			outline: 0.01,
		});
		// The amber side marker wraps back along the fender from the front lens, its rear edge raked the same way.
		const wrap = lens([[lensX + 0.0175 - NOSE_X, -h / 2], [-FRONT.cornerWrapBot, -h / 2], [-FRONT.cornerWrapTop, h / 2], [lensX + 0.0175 - NOSE_X, h / 2]]);
		add(body, extrude(wrap, 0.03, 0.006, false), amberMat, [NOSE_X, bandY, side * (BODY_HALF_W + 0.006)], { outline: 0.01 });
	});

	// Chrome bumper: a pressed face that wraps back around both front corners, amber turn lamps set in it.
	const bumperY = FRONT.bumperY;
	add(body, slab(0.1, FRONT.bumperH, BODY_HALF_W * 2 + 0.04, 0.035, 0.02), chromeMat, [NOSE_X + 0.07, bumperY, 0], { outline: OUTLINE_SMALL });
	pair((side) => {
		add(body, slab(0.26, FRONT.bumperH, 0.08, 0.035, 0.02), chromeMat, [NOSE_X - 0.04, bumperY, side * (BODY_HALF_W + 0.0)], { outline: OUTLINE_SMALL });
		add(body, slab(0.02, 0.055, 0.17, 0.012, 0.006), amberMat, [NOSE_X + 0.12, bumperY - 0.02, side * FRONT.turnZ], { outline: 0.01 });
	});
	// A pressed crease along the bumper face.
	add(body, slab(0.01, 0.01, BODY_HALF_W * 2 - 0.1, 0.003, 0.002), trimMat, [NOSE_X + 0.121, bumperY + 0.035, 0], { outline: 0 });
	// Valance under the bumper, in body color, with horizontal slots.
	add(body, slab(0.1, FRONT.valanceH, BODY_HALF_W * 2 - 0.12, 0.03, 0.015), bodyMat, [NOSE_X + 0.02, FRONT.valanceY, 0], { outline: 0.02 });
	for (let i = 0; i < 4; i++) {
		add(body, slab(0.012, 0.014, 1.0, 0.005, 0.003), trimMat, [NOSE_X + 0.071, FRONT.valanceY - 0.045 + i * 0.03, 0], { outline: 0 });
	}

	// --- Rear end ---
	// Chrome step bumper wrapping round the corners, the plate recessed in its center.
	add(body, slab(0.17, 0.17, 1.74, 0.05, 0.02), chromeMat, [TAIL_X - 0.11, 0.45, 0]);
	pair((side) => add(body, slab(0.2, 0.17, 0.08, 0.05, 0.02), chromeMat, [TAIL_X - 0.04, 0.45, side * 0.85], { outline: OUTLINE_SMALL }));
	add(body, slab(0.02, 0.12, 0.34, 0.02, 0.008), trimMat, [TAIL_X - 0.196, 0.45, 0], { outline: 0 }); // plate recess
	add(body, slab(0.02, 0.1, 0.3, 0.02, 0.008), headlinerMat, [TAIL_X - 0.2, 0.45, 0], { outline: 0.01 }); // plate
	pair((side) => {
		// Tall tail lamp on each bed corner: amber turn signal on top, clear reverse lamp, then the big red tail/stop lens.
		const lampZ = side * (BODY_HALF_W - 0.045);
		const lampX = TAIL_X - 0.012;
		const lampH = TAIL_LAMP.amber + TAIL_LAMP.clear + TAIL_LAMP.red;
		// Dark bezel round the whole lamp, so the red lens stands off red paint.
		add(body, slab(0.024, lampH + 0.024, TAIL_LAMP.w + 0.024, 0.01, 0.004), trimMat, [lampX + 0.006, TAIL_LAMP.top - lampH / 2, lampZ], { outline: 0 });
		add(body, slab(0.03, TAIL_LAMP.amber, TAIL_LAMP.w, 0.008, 0.004), amberMat, [lampX, TAIL_LAMP.top - TAIL_LAMP.amber / 2, lampZ], { outline: 0.01 });
		add(body, slab(0.03, TAIL_LAMP.clear, TAIL_LAMP.w, 0.004, 0.003), clearLensMat, [lampX, TAIL_LAMP.top - TAIL_LAMP.amber - TAIL_LAMP.clear / 2, lampZ], { outline: 0.01 });
		add(body, slab(0.03, TAIL_LAMP.red, TAIL_LAMP.w, 0.008, 0.004), tailMat, [lampX, TAIL_LAMP.top - TAIL_LAMP.amber - TAIL_LAMP.clear - TAIL_LAMP.red / 2, lampZ], {
			outline: 0.01,
		});
		// Mudflaps behind the rear and front wheels.
		add(body, slab(0.03, 0.24, 0.2, 0.01, 0.005), trimMat, [REAR_AXLE_X - 0.5, 0.28, side * 0.76], { outline: 0 });
		add(body, slab(0.03, 0.22, 0.2, 0.01, 0.005), trimMat, [FRONT_AXLE_X - 0.5, 0.28, side * 0.76], { outline: 0 });
	});

	// --- Wheels ---
	const wheels: Group[] = [];
	/** Tire radius, meters: the axle height, since the tire stands on the ground. */
	let tireR = WHEEL_R;
	if (!options.wheel && !options.tire) {
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
				disc(0.028, 0.034, hubMat, 0.108, 12); // chrome center of the cap
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
	} else {
		// Sized from the build: tire diameter from its size code, rim from the wheel, track from the offset.
		const wheel = options.wheel ?? { diameterIn: 14, widthIn: 5.5, offsetMm: 20, style: "hubcap" as const };
		const tire = options.tire ?? { widthMm: 195, aspect: 75, rimIn: wheel.diameterIn };
		tireR = (wheel.diameterIn * INCH) / 2 + (tire.widthMm * tire.aspect) / 100 / 1000;
		const halfW = tire.widthMm / 2000;
		// A mud tire's lugs reach the full diameter; its carcass sits a lug's depth inside it.
		const lugDepth = tire.lugs ? tire.lugs.depthIn * INCH : 0;
		const crownR = tireR - lugDepth;
		const lugGeo = tire.lugs ? kit.geometry(mudLugs(crownR, lugDepth, halfW, (tire.lugs.treadWidthIn * INCH) / 2)) : undefined;
		const rimR = (wheel.diameterIn * INCH) / 2;
		const rimHalfW = (wheel.widthIn * INCH) / 2;
		const centerZ = HUB_FACE_Z - wheel.offsetMm / 1000;
		const profile = [
			new Vector2(rimR - 0.012, -halfW * 0.92),
			new Vector2(crownR - 0.04, -halfW),
			new Vector2(crownR - 0.005, -halfW * 0.75),
			new Vector2(crownR, -halfW * 0.5),
			new Vector2(crownR, halfW * 0.5),
			new Vector2(crownR - 0.005, halfW * 0.75),
			new Vector2(crownR - 0.04, halfW),
			new Vector2(rimR - 0.012, halfW * 0.92),
		];
		const capMat = std(tint(colors.silver, 0.1), 0.22, 0.9);
		const machinedMat = std(tint(colors.silver, 0.2), 0.32, 0.85);
		// The mesh wheel's spokes and center in BBS Diamond Black, or chrome-plated: mirror-bright spokes over a
		// plated barrel that sits deep in the wheel and mostly reflects the tire and the wheel well.
		const chromeWheel = wheel.finish === "chrome";
		const meshBlackMat = chromeWheel ? mirrorMat : std("#2a2d31", 0.3, 0.6);
		const barrelMat = chromeWheel ? std("#6d7278", 0.12, 1) : std("#0c0d0f", 0.7, 0.2);
		const capGoldMat = std("#c9a24a", 0.35, 0.8);
		for (const [x, side] of [
			[FRONT_AXLE_X, 1],
			[FRONT_AXLE_X, -1],
			[REAR_AXLE_X, 1],
			[REAR_AXLE_X, -1],
		] as [number, 1 | -1][]) {
			const pivot = new Group();
			pivot.position.set(x, tireR, side * centerZ);
			const tireGeo = new LatheGeometry(profile, 36);
			tireGeo.rotateX(Math.PI / 2);
			add(pivot, tireGeo, trimMat, [0, 0, 0]);
			if (lugGeo) add(pivot, lugGeo, trimMat, [0, 0, 0], { outline: 0 });
			const disc = (r: number, h: number, mat: Material, z: number, seg = 28) => {
				const g = new CylinderGeometry(r, r, h, seg);
				g.rotateX(Math.PI / 2);
				return add(pivot, g, mat, [0, 0, z], { outline: 0 });
			};
			// Only the outboard face shows; s points outboard.
			const s = side;
			// Rim lip; steel wheels and covers also get a solid face, spoked wheels show their spokes against a dark barrel.
			add(pivot, new TorusGeometry(rimR + 0.006, 0.016, 6, 32), silverMat, [0, 0, s * rimHalfW * 0.85], { outline: 0 });
			const face = s * (rimHalfW * 0.85 + 0.012);
			if (wheel.style !== "alloy" && wheel.style !== "mesh") disc(rimR + 0.006, 0.02, silverMat, s * rimHalfW * 0.75);
			const lugs = (z: number) => {
				for (let i = 0; i < 5; i++) {
					const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
					const lug = new CylinderGeometry(0.012, 0.012, 0.026, 6);
					lug.rotateX(Math.PI / 2);
					add(pivot, lug, trimMat, [Math.cos(a) * LUG_RADIUS, Math.sin(a) * LUG_RADIUS, z], { outline: 0 });
				}
			};
			if (wheel.style === "hubcap") {
				// Full wheel cover, as the base trucks wore: a shallow dome with a ring and a center emblem.
				disc(rimR - 0.004, 0.024, capMat, face);
				add(pivot, new TorusGeometry(rimR * 0.62, 0.006, 6, 32), dishMat, [0, 0, face + s * 0.012], { outline: 0 });
				disc(0.04, 0.03, hubMat, face + s * 0.006, 18);
			} else if (wheel.style === "steel") {
				// Bare steel: the pressed dish, its vent slots, the hub and the five lugs.
				disc(rimR - 0.035, 0.012, dishMat, face - s * 0.006);
				disc(0.045, 0.026, trimMat, face, 16);
				lugs(face + s * 0.004);
				for (let i = 0; i < 5; i++) {
					const b = (i / 5) * Math.PI * 2;
					add(pivot, slab(0.05, 0.02, 0.012, 0.008, 0.003), trimMat, [Math.cos(b) * (rimR * 0.66), Math.sin(b) * (rimR * 0.66), face], {
						rot: [0, 0, b],
						outline: 0,
					});
				}
			} else if (wheel.style === "mesh") {
				// BBS RG-R: a cross-laced mesh of twenty spokes (Diamond Black or chrome), a diamond-cut lip and a
				// center cap, over the barrel.
				disc(rimR - 0.006, 0.006, barrelMat, face - s * 0.016);
				add(pivot, new TorusGeometry(rimR - 0.004, 0.012, 6, 36), machinedMat, [0, 0, face - s * 0.002], { outline: 0 });
				const inner = rimR * 0.3;
				const outer = rimR * 0.92;
				const len = outer - inner;
				for (let i = 0; i < 10; i++) {
					for (const skew of [-0.32, 0.32]) {
						const a = (i / 10) * Math.PI * 2 + skew / 2;
						add(pivot, slab(len, 0.014, 0.014, 0.004, 0.002), meshBlackMat, [Math.cos(a) * (inner + len / 2), Math.sin(a) * (inner + len / 2), face - s * 0.006], {
							rot: [0, 0, a + skew],
							outline: 0,
						});
					}
				}
				const hub = new CylinderGeometry(rimR * 0.32, rimR * 0.36, 0.022, 28);
				hub.rotateX((s * Math.PI) / 2);
				add(pivot, hub, meshBlackMat, [0, 0, face + s * 0.002], { outline: 0 });
				lugs(face + s * 0.014);
				disc(0.032, 0.02, trimMat, face + s * 0.012, 18);
				add(pivot, new TorusGeometry(0.03, 0.003, 6, 20), machinedMat, [0, 0, face + s * 0.023], { outline: 0 });
			} else if (wheel.style === "eighthole") {
				// Ultra 164: a polished disc with eight round holes and a raised center carrying the lugs.
				disc(rimR + 0.004, 0.006, trimMat, face - s * 0.03);
				disc(rimR - 0.002, 0.016, silverMat, face - s * 0.006, 36);
				for (let i = 0; i < 8; i++) {
					const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
					const hole = new CylinderGeometry(rimR * 0.15, rimR * 0.15, 0.006, 18);
					hole.rotateX(Math.PI / 2);
					add(pivot, hole, trimMat, [Math.cos(a) * rimR * 0.64, Math.sin(a) * rimR * 0.64, face + s * 0.003], { outline: 0 });
				}
				const hub = new CylinderGeometry(rimR * 0.36, rimR * 0.4, 0.03, 28);
				hub.rotateX((s * Math.PI) / 2);
				add(pivot, hub, silverMat, [0, 0, face + s * 0.012], { outline: 0 });
				lugs(face + s * 0.028);
				disc(0.03, 0.03, silverMat, face + s * 0.024, 16);
			} else if (wheel.style === "hammer") {
				// Ultra Hammer: a machined aluminum disc with five trapezoid slots near the rim, a raised
				// center cone and a small black cap, as on the NOS set in Kyle's reference build.
				disc(rimR + 0.004, 0.006, trimMat, face - s * 0.03);
				disc(rimR - 0.002, 0.016, machinedMat, face - s * 0.006, 36);
				for (let i = 0; i < 5; i++) {
					const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
					const slot = new Shape(
						[
							[rimR * 0.5, -0.032],
							[rimR * 0.9, -0.05],
							[rimR * 0.9, 0.05],
							[rimR * 0.5, 0.032],
						].map(([u, v]) => new Vector2(u, v)),
					);
					const g = extrude(slot, 0.006, 0.002, false);
					add(pivot, g, trimMat, [0, 0, face + s * 0.004], { rot: [0, 0, a], outline: 0 });
				}
				const cone = new CylinderGeometry(0.05, 0.085, 0.024, 28);
				cone.rotateX((s * Math.PI) / 2);
				add(pivot, cone, machinedMat, [0, 0, face + s * 0.012], { outline: 0 });
				disc(0.034, 0.03, trimMat, face + s * 0.016, 18);
				add(pivot, new TorusGeometry(0.03, 0.003, 6, 20), capGoldMat, [0, 0, face + s * 0.032], { outline: 0 });
			} else {
				// Alloy: five spokes from a center cap out to the rim (a plain stand-in until a real wheel is picked).
				disc(rimR + 0.004, 0.006, trimMat, face - s * 0.03);
				for (let i = 0; i < 5; i++) {
					const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
					const len = rimR - 0.03;
					add(pivot, slab(len, 0.045, 0.026, 0.012, 0.006), silverMat, [Math.cos(a) * (len / 2 + 0.03), Math.sin(a) * (len / 2 + 0.03), face - s * 0.004], {
						rot: [0, 0, a],
						outline: 0.004,
					});
				}
				disc(0.07, 0.03, silverMat, face, 24);
				lugs(face + s * 0.012);
				disc(0.028, 0.034, hubMat, face + s * 0.006, 14);
			}
			group.add(pivot);
			wheels.push(pivot);
		}
	}

	// Ride height and tire size move the body over the wheels: the change at each axle, plus how much
	// taller (or shorter) the tires are than the 0.33 m reference, pitching the body if the axles differ.
	const ride = options.ride ?? { front: 0, rear: 0 };
	const lift = tireR - WHEEL_R;
	const pitch = (ride.front - ride.rear) / (FRONT_AXLE_X - REAR_AXLE_X);
	body.rotation.z = Math.atan(pitch);
	body.position.y = ride.rear + lift - REAR_AXLE_X * pitch;

	if (hoops) {
		// Custom front shock hoops: the shocks (by default two Rancho RS5000Xs, 2.25 in white bodies, red boots)
		// stand just inboard of each front tire, from the lower control arm up to hoops under the roof of the
		// wheel well. Two to a wheel, one leans forward and one back so both show over the tire; a single one
		// leans forward. Where the hoops put them, and their 1.75 in tube, are estimates.
		body.updateMatrix();
		const toBody = body.matrix.clone().invert();
		const shockWhite = shockSetup.metallic ? std(shockSetup.body, 0.3, 0.8) : std(shockSetup.body, 0.45, 0.05);
		const bootRed = std(shockSetup.boot, 0.6, 0.02);
		const hoopMat = std("#1d1f22", 0.5, 0.4);
		const hoopR = (1.75 * INCH) / 2;
		// Each top sits toward one end of the arch, where the tire falls away fastest, just under the well's lined roof.
		const topDx = 0.26;
		const [roofRx, roofRy] = [ARCH_RX - 0.024, ARCH_RY - 0.024];
		const roofY = AXLE_Y + roofRy * (1 - (topDx / roofRx) ** ARCH_SQUARENESS) ** (1 / ARCH_SQUARENESS);
		const eye = () => {
			const g = new CylinderGeometry(0.018, 0.018, 0.04, 12);
			g.rotateX(Math.PI / 2);
			return g;
		};
		pair((side) => {
			for (const fore of shockSetup.perWheel === 1 ? [1] : [1, -1]) {
				const bottom = new Vector3(FRONT_AXLE_X + fore * 0.04, tireR - 0.08, side * shockZ).applyMatrix4(toBody);
				const top = new Vector3(FRONT_AXLE_X + fore * topDx, roofY - 0.05, side * (shockZ - 0.02));
				const axis = top.clone().sub(bottom);
				const len = axis.length();
				const shock = new Group();
				shock.position.copy(bottom);
				shock.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis.normalize());
				body.add(shock);
				// Body down, rod up: the white twin-tube body, then the red bellows boot over the rod, an eye at each end.
				const bodyLen = len * 0.52;
				const bootLen = len - bodyLen - 0.05;
				add(shock, eye(), trimMat, [0, 0, 0], { outline: 0 });
				add(shock, new CylinderGeometry(SHOCK_R, SHOCK_R, bodyLen, 18), shockWhite, [0, 0.02 + bodyLen / 2, 0]);
				const folds = 9;
				const bellows: Vector2[] = [];
				for (let i = 0; i <= folds * 2; i++) bellows.push(new Vector2(i % 2 ? SHOCK_R * 0.92 : SHOCK_R * 0.74, (i / (folds * 2)) * bootLen));
				add(shock, new LatheGeometry(bellows, 16), bootRed, [0, 0.02 + bodyLen, 0]);
				add(shock, eye(), trimMat, [0, len, 0], { outline: 0 });
				// The hoop: an upside-down U of tube straddling the top of the shock, its legs running down behind the tire to the frame.
				const crossY = top.y + 0.028;
				const legLow = crossY - 0.2;
				const [hx0, hx1] = [top.x - 0.055, top.x + 0.055];
				const path = new CatmullRomCurve3(
					[
						new Vector3(hx0, legLow, top.z),
						new Vector3(hx0, crossY - 0.03, top.z),
						new Vector3(hx0 + 0.02, crossY, top.z),
						new Vector3(hx1 - 0.02, crossY, top.z),
						new Vector3(hx1, crossY - 0.03, top.z),
						new Vector3(hx1, legLow, top.z),
					],
					false,
					"catmullrom",
					0.2,
				);
				add(body, new TubeGeometry(path, 40, hoopR, 10, false), hoopMat, [0, 0, 0], { outline: 0.006 });
			}
		});
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

	const dispose = () => {
		kit.dispose();
		boardDispose?.();
	};
	if (!openable) {
		return { group, wheels, parts: kit.parts, lights: { head: headMat, tail: tailMat }, dispose };
	}
	[openers.doorRight, openers.doorLeft] = doors;
	for (const [key, pivot] of Object.entries(openers)) pivot.traverse((o) => (o.userData.opener = key));
	const setOpen = (key: OpenerKey, amount: number) => {
		const t = Math.max(0, Math.min(1, amount));
		if (key === "hood") openers.hood.rotation.z = t * OPEN_ANGLES.hood; // front edge lifts
		else if (key === "tailgate") openers.tailgate.rotation.z = t * OPEN_ANGLES.tailgate; // top drops rearward
		else openers[key].rotation.y = (key === "doorRight" ? 1 : -1) * t * OPEN_ANGLES.door; // swings outboard
	};
	return { group, wheels, parts: kit.parts, lights: { head: headMat, tail: tailMat }, openers, setOpen, dispose };
}
