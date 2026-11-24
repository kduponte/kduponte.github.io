import {
	CatmullRomCurve3,
	Color,
	CylinderGeometry,
	DoubleSide,
	Group,
	LatheGeometry,
	Matrix4,
	MeshStandardMaterial,
	TubeGeometry,
	Vector2,
	Vector3,
	type Material,
	type Mesh,
	type Object3D,
} from "three";
import { createPartKit, slab } from "./kit";
import { COMPRESSION_HEIGHT, ENGINE, ENGINE_SYSTEMS, crankPhase, firingGlow, pistonCrownY, type EngineSystem } from "./engine-22re-data";

/**
 * The 22R-E in the truck family's style: softened parts, PBR materials, black inverted-hull
 * outlines. Built in meters around the crankshaft centerline, so it can drop into the truck's
 * engine bay at real size.
 *
 * Drawn to scale from engine-22re-data.ts: bore, stroke, connecting rod, crank-to-deck and
 * pan-rail-to-deck heights, head deck height, four cylinders at the estimated bore spacing, and
 * the firing order. Everything bolted on (manifolds, pumps, fan, alternator) is proportioned from
 * photos of 22R-E engines and placed where it sits on a US pickup: intake plenum on the passenger
 * side, exhaust manifold on the driver's side, "22R-E" badge on the valve cover.
 *
 * Axes match the truck: +X toward the front (the timing chain end, cylinder 1), +Y up, +Z the
 * passenger (right-hand) side. The driver's side of the block is cut away to show the pistons.
 */

export interface EngineModel {
	group: Group;
	/** Every visible mesh (excludes outline shells). */
	parts: Mesh[];
	/** The meshes that carry each system's color, for picking and highlighting. */
	systems: Record<EngineSystem, Mesh[]>;
	/** One material per system; its emissive channel is the highlight. */
	systemMaterials: Record<EngineSystem, MeshStandardMaterial>;
	/** Pose the crank, rods and pistons at crank angle `theta` (radians, 0 = cylinder 1 at TDC), and light the crown of whichever cylinder is firing. */
	setCrank(theta: number): void;
	dispose(): void;
}

export interface EngineOptions {
	/** Color per system. Systems left out get their real material color. */
	tints?: Partial<Record<EngineSystem, string>>;
	/** Cut the driver's side of the block away to show the moving internals. Default true. */
	cutaway?: boolean;
}

/** What each system's parts look like with no data tint: the real finishes. */
const REAL_FINISH: Record<EngineSystem, [string, number, number]> = {
	drivetrain: ["#a9aeb2", 0.5, 0.6], // cast aluminum bellhousing
	electrical: ["#c3c7ca", 0.4, 0.7],
	fuel: ["#c0c4c7", 0.45, 0.6],
	cooling: ["#8c9094", 0.5, 0.5],
	ac: ["#b8bcbf", 0.45, 0.6],
	timing: ["#b4b9bd", 0.5, 0.6],
	headGasket: ["#8a8f93", 0.6, 0.5],
	oil: ["#2a2b2d", 0.6, 0.3],
};

const O_BIG = 0.008;
const O_SMALL = 0.005;

// Layout, in meters, around the crank centerline.
const S = ENGINE.boreSpacingEstimate;
/** Cylinder centers along X, cylinder 1 at the front. */
export const CYLINDER_X = [1.5, 0.5, -0.5, -1.5].map((k) => k * S);
const R_BORE = ENGINE.bore / 2;
const R_CRANK = ENGINE.stroke / 2;
const DECK_Y = ENGINE.crankToDeck;
const PAN_Y = DECK_Y - ENGINE.panRailToDeck;
const BLOCK_FRONT = CYLINDER_X[0] + R_BORE + 0.022;
const BLOCK_HALF_W = 0.115;
const GASKET = 0.006;
/** Top of the head: its deck height to the cam journal, plus the journal cap. */
const HEAD_TOP = DECK_Y + GASKET + ENGINE.headDeck + 0.012;
const PISTON_H = 0.058;

/** The main heights and lengths, for anything that draws the engine without three.js (the SVG fallback). */
export const ENGINE_LAYOUT = { blockFront: BLOCK_FRONT, deckY: DECK_Y, panY: PAN_Y, headTop: HEAD_TOP, gasket: GASKET, pumpY: 0.16 } as const;

/** The throttle body on the front of the EFI plenum (passenger side; see `plenum` in the intake below). */
const TB = { x: -0.015 + 0.36 / 2 + 0.028, y: HEAD_TOP + 0.06, z: 0.2 };
/** Points along the cut-short intake hose, in the engine's frame; the last is where a truck's duct picks it up. */
export const INTAKE_STUB: readonly (readonly [number, number, number])[] = [
	[TB.x + 0.025, TB.y, TB.z],
	[TB.x + 0.08, TB.y + 0.01, TB.z - 0.02],
	[TB.x + 0.12, TB.y + 0.02, TB.z - 0.07],
];

/** Stroke glyphs on a 0.75 x 1 cell, for the cast and badge lettering. */
const GLYPHS: Record<string, [number, number, number, number][]> = {
	E: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 1],
		[0, 0.5, 0.6, 0.5],
		[0, 0, 0.75, 0],
	],
	F: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 1],
		[0, 0.5, 0.6, 0.5],
	],
	I: [
		[0.375, 0, 0.375, 1],
		[0.15, 1, 0.6, 1],
		[0.15, 0, 0.6, 0],
	],
	"2": [
		[0, 1, 0.75, 1],
		[0.75, 1, 0.75, 0.5],
		[0.75, 0.5, 0, 0.5],
		[0, 0.5, 0, 0],
		[0, 0, 0.75, 0],
	],
	R: [
		[0, 0, 0, 1],
		[0, 1, 0.75, 1],
		[0.75, 1, 0.75, 0.5],
		[0.75, 0.5, 0, 0.5],
		[0.3, 0.5, 0.75, 0],
	],
	"-": [[0.15, 0.5, 0.6, 0.5]],
};

/** Points on the convex hull of a 2D point set (Andrew's monotone chain), counter-clockwise. */
function convexHull(points: Vector2[]): Vector2[] {
	const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Vector2, a: Vector2, b: Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Vector2[] = [];
	for (const pt of p) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
		lower.push(pt);
	}
	const upper: Vector2[] = [];
	for (const pt of p.reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
		upper.push(pt);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function build22REEngine(opts: EngineOptions = {}): EngineModel {
	const { tints = {}, cutaway = true } = opts;
	const kit = createPartKit("#111111");
	const { add, std } = kit;
	const group = new Group();

	const iron = std("#5d6165", 0.75, 0.35);
	const ironInside = std("#8b8f93", 0.45, 0.55);
	ironInside.side = DoubleSide;
	const alu = std("#b9bec3", 0.45, 0.6);
	const crinkle = std("#1f2022", 0.65, 0.2);
	const rust = std("#7b4a33", 0.85, 0.3);
	const steel = std("#c9ced2", 0.3, 0.85);
	const pistonMat = std("#d9dbdd", 0.35, 0.7);
	const rubber = std("#18191a", 0.9);
	const badgeRed = std("#c4262e", 0.4);
	const badgeInk = std("#f6f1e4", 0.6);
	const zinc = std("#dfe3e6", 0.3, 0.8);

	const systemMaterials = {} as Record<EngineSystem, MeshStandardMaterial>;
	const systems = {} as Record<EngineSystem, Mesh[]>;
	for (const { key } of ENGINE_SYSTEMS) {
		const tint = tints[key];
		const [real, rough, metal] = REAL_FINISH[key];
		const m = tint ? std(tint, 0.5, 0.15) : std(real, rough, metal);
		m.emissive = new Color(tint ?? real);
		m.emissiveIntensity = 0;
		systemMaterials[key] = m;
		systems[key] = [];
	}
	/** Add a part that belongs to a system: colored by it, and pickable. */
	const addSys = (key: EngineSystem, parent: Object3D, geo: Parameters<typeof add>[1], pos: [number, number, number], o?: Parameters<typeof add>[4]) => {
		const mesh = add(parent, geo, systemMaterials[key], pos, o);
		mesh.userData.system = key;
		systems[key].push(mesh);
		return mesh;
	};
	const tube = (points: [number, number, number][], radius: number, closed = false, segments = 32) =>
		new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed), segments, radius, 8, closed);
	/** A cylinder whose axis runs along X. */
	const xCyl = (r: number, len: number, seg = 24, r2 = r) => {
		const g = new CylinderGeometry(r2, r, len, seg);
		g.rotateZ(-Math.PI / 2);
		return g;
	};

	/**
	 * Stroke lettering on a flat face. `u` runs along the text, `v` is the letters' up, and the face
	 * normal is u x v.
	 */
	const lettering = (parent: Object3D, text: string, center: Vector3, u: Vector3, v: Vector3, height: number, stroke: number, mat: Material) => {
		const n = new Vector3().crossVectors(u, v).normalize();
		const cellW = 0.75 * height;
		const gap = 0.3 * height;
		const total = text.length * cellW + (text.length - 1) * gap;
		[...text].forEach((ch, i) => {
			const left = -total / 2 + i * (cellW + gap);
			for (const [u0, v0, u1, v1] of GLYPHS[ch] ?? []) {
				const du = (u1 - u0) * height;
				const dv = (v1 - v0) * height;
				const len = Math.hypot(du, dv) + stroke;
				const dir = u.clone().multiplyScalar(du).addScaledVector(v, dv).normalize();
				const side = new Vector3().crossVectors(n, dir);
				const mid = center
					.clone()
					.addScaledVector(u, left + ((u0 + u1) / 2) * height)
					.addScaledVector(v, ((v0 + v1) / 2 - 0.5) * height)
					.addScaledVector(n, stroke * 0.3);
				const mesh = add(parent, slab(len, stroke, stroke * 0.6, stroke * 0.3, stroke * 0.1), mat, [mid.x, mid.y, mid.z], { outline: 0 });
				mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(dir, side, n));
			}
		});
	};

	const blockLen = BLOCK_FRONT * 2;
	const blockH = DECK_Y - PAN_Y;
	const blockMidY = (DECK_Y + PAN_Y) / 2;

	// --- Block: cast iron. Walls, deck and pan rail; the driver's side is open when cut away. ---
	add(group, slab(blockLen, blockH, 0.016, 0.006, 0.003), iron, [0, blockMidY, BLOCK_HALF_W - 0.008], { outline: O_BIG });
	for (const x of [BLOCK_FRONT - 0.008, -BLOCK_FRONT + 0.008]) {
		add(group, slab(0.016, blockH, BLOCK_HALF_W * 2, 0.006, 0.003), iron, [x, blockMidY, 0], { outline: O_BIG });
	}
	add(group, slab(blockLen, 0.014, BLOCK_HALF_W * 2, 0.005, 0.003), iron, [0, DECK_Y - 0.007, 0], { outline: O_SMALL });
	add(group, slab(blockLen + 0.012, 0.012, BLOCK_HALF_W * 2 + 0.016, 0.004, 0.002), iron, [0, PAN_Y + 0.006, 0], { outline: O_SMALL });
	if (cutaway) {
		// What's left of the driver's-side wall around the cut: a rail under the deck, one above the pan rail.
		add(group, slab(blockLen, 0.022, 0.016, 0.005, 0.003), iron, [0, DECK_Y - 0.025, -BLOCK_HALF_W + 0.008], { outline: O_SMALL });
		add(group, slab(blockLen, 0.026, 0.016, 0.005, 0.003), iron, [0, PAN_Y + 0.025, -BLOCK_HALF_W + 0.008], { outline: O_SMALL });
	} else {
		add(group, slab(blockLen, blockH, 0.016, 0.006, 0.003), iron, [0, blockMidY, -BLOCK_HALF_W + 0.008], { outline: O_BIG });
	}
	// Freeze plugs pressed into the passenger-side water jacket, and an engine mount boss each side.
	for (const x of [-S, 0, S]) {
		const plug = new CylinderGeometry(0.017, 0.017, 0.006, 16);
		plug.rotateX(Math.PI / 2);
		add(group, plug, zinc, [x, DECK_Y - 0.075, BLOCK_HALF_W + 0.002], { outline: 0 });
	}
	for (const side of [1, -1]) {
		add(group, slab(0.07, 0.05, 0.03, 0.01, 0.005), iron, [0.02, 0.05, side * (BLOCK_HALF_W + 0.014)], { outline: O_SMALL });
	}

	// --- Bores, pistons, rods and crank (visible through the cut) ---
	const boreLen = PISTON_H + ENGINE.stroke + 0.006;
	for (const x of CYLINDER_X) {
		// Half shell: the passenger-side half of each bore, so the piston shows against it.
		const shell = new CylinderGeometry(R_BORE + 0.001, R_BORE + 0.001, boreLen, 28, 1, true, cutaway ? -Math.PI / 2 : 0, cutaway ? Math.PI : Math.PI * 2);
		add(group, shell, ironInside, [x, DECK_Y - boreLen / 2, 0], { outline: 0 });
	}

	const pistons: Group[] = [];
	const rods: Mesh[] = [];
	const crowns: MeshStandardMaterial[] = [];
	CYLINDER_X.forEach((x) => {
		const piston = new Group();
		piston.position.x = x;
		// Local origin at the crown. Skirt, two ring lands, and a crown that glows when it fires.
		add(piston, new CylinderGeometry(R_BORE - 0.0015, R_BORE - 0.0015, PISTON_H - 0.004, 28), pistonMat, [0, -(PISTON_H + 0.004) / 2, 0], { outline: 0.003 });
		for (const dy of [-0.009, -0.016]) {
			add(piston, new CylinderGeometry(R_BORE - 0.0008, R_BORE - 0.0008, 0.002, 28), crinkle, [0, dy, 0], { outline: 0 });
		}
		const crown = std("#d9dbdd", 0.35, 0.6);
		crown.emissive = new Color("#ff7a1a");
		crown.emissiveIntensity = 0;
		crowns.push(crown);
		add(piston, new CylinderGeometry(R_BORE - 0.0015, R_BORE - 0.0015, 0.004, 28), crown, [0, -0.002, 0], { outline: 0 });
		add(piston, xCyl(0.011, 0.06, 12), steel, [0, -COMPRESSION_HEIGHT, 0], { outline: 0 }); // wrist pin
		group.add(piston);
		pistons.push(piston);
		const rod = add(group, slab(0.016, ENGINE.rod, 0.022, 0.006, 0.003), steel, [x, 0, 0], { outline: 0.003 });
		rods.push(rod);
	});

	const crank = new Group();
	add(crank, xCyl(0.027, blockLen + 0.02), steel, [0, 0, 0], { outline: 0.003 }); // main journals
	CYLINDER_X.forEach((x, i) => {
		const a = crankPhase(i + 1);
		const py = R_CRANK * Math.cos(a);
		const pz = R_CRANK * Math.sin(a);
		add(crank, xCyl(0.025, 0.026), steel, [x, py, pz], { outline: 0.003 }); // crankpin
		for (const dx of [-0.022, 0.022]) {
			// Web from the main journal out past the pin, and its counterweight opposite.
			add(crank, slab(0.014, R_CRANK + 0.04, 0.05, 0.012, 0.004), steel, [x + dx, py / 2, pz / 2], { outline: 0.003 });
			add(crank, slab(0.014, 0.05, 0.085, 0.02, 0.004), steel, [x + dx, -py * 0.85, -pz * 0.85], { outline: 0.003 });
		}
	});
	add(crank, xCyl(0.02, 0.07), steel, [BLOCK_FRONT + 0.035, 0, 0], { outline: 0 }); // snout through the timing cover
	// Harmonic balancer at the nose, with its white timing notch so the rotation reads.
	add(crank, xCyl(0.075, 0.032, 32), crinkle, [BLOCK_FRONT + 0.06, 0, 0], { outline: O_SMALL });
	add(crank, slab(0.034, 0.02, 0.006, 0.002, 0.001), badgeInk, [BLOCK_FRONT + 0.06, 0.066, 0], { outline: 0 });
	group.add(crank);

	const setCrank = (theta: number) => {
		crank.rotation.x = theta;
		CYLINDER_X.forEach((x, i) => {
			const cyl = i + 1;
			const crownY = pistonCrownY(theta, cyl);
			pistons[i].position.y = crownY;
			const a = theta + crankPhase(cyl);
			const pin = new Vector3(x, crownY - COMPRESSION_HEIGHT, 0);
			const crankpin = new Vector3(x, R_CRANK * Math.cos(a), R_CRANK * Math.sin(a));
			rods[i].position.copy(pin).add(crankpin).multiplyScalar(0.5);
			rods[i].rotation.x = Math.atan2(pin.z - crankpin.z, pin.y - crankpin.y);
			crowns[i].emissiveIntensity = firingGlow(theta, cyl) * 1.6;
		});
	};

	// --- Head gasket, head, valve cover ---
	addSys("headGasket", group, slab(blockLen + 0.006, GASKET, BLOCK_HALF_W * 2 + 0.008, 0.002, 0.001), [0, DECK_Y + GASKET / 2, 0], { outline: 0.003 });
	const headH = HEAD_TOP - DECK_Y - GASKET;
	add(group, slab(blockLen + 0.004, headH, BLOCK_HALF_W * 2 + 0.002, 0.012, 0.006), alu, [0, DECK_Y + GASKET + headH / 2, 0], { outline: O_BIG });
	addSys("oil", group, slab(blockLen - 0.03, 0.005, 0.196, 0.003, 0.001), [0, HEAD_TOP + 0.0025, 0], { outline: 0.003 }); // valve cover gasket
	const coverY = HEAD_TOP + 0.005 + 0.029;
	add(group, slab(blockLen - 0.034, 0.058, 0.19, 0.022, 0.012), crinkle, [0, coverY, 0], { outline: O_BIG });
	for (const z of [-0.05, 0.05]) {
		add(group, slab(blockLen - 0.12, 0.008, 0.012, 0.004, 0.002), crinkle, [-0.02, coverY + 0.032, z], { outline: 0.003 });
	}
	// Oil filler cap and the red "22R-E" badge at the front of the cover.
	const cap = new CylinderGeometry(0.03, 0.03, 0.022, 20);
	add(group, cap, crinkle, [0.13, coverY + 0.038, -0.035], { outline: O_SMALL });
	add(group, slab(0.004, 0.03, 0.09, 0.004, 0.0015), badgeRed, [BLOCK_FRONT - 0.015, coverY + 0.004, 0.02], { outline: 0.002 });
	lettering(group, "22R-E", new Vector3(BLOCK_FRONT - 0.013, coverY + 0.004, 0.02), new Vector3(0, 0, -1), new Vector3(0, 1, 0), 0.017, 0.0035, badgeInk);

	// --- Timing chain cover, water pump, fan, thermostat housing and hose ---
	const coverTop = HEAD_TOP - 0.008;
	const coverBottom = PAN_Y + 0.012;
	addSys("timing", group, slab(0.03, coverTop - coverBottom, 0.22, 0.04, 0.01), [BLOCK_FRONT + 0.015, (coverTop + coverBottom) / 2, 0], { outline: O_BIG });
	const pumpY = ENGINE_LAYOUT.pumpY;
	addSys("cooling", group, xCyl(0.05, 0.045, 24), [BLOCK_FRONT + 0.052, pumpY, 0], { outline: O_SMALL });
	add(group, xCyl(0.06, 0.016, 28), crinkle, [BLOCK_FRONT + 0.083, pumpY, 0], { outline: O_SMALL }); // pump pulley
	addSys("cooling", group, xCyl(0.042, 0.04, 20), [BLOCK_FRONT + 0.11, pumpY, 0], { outline: O_SMALL }); // fan clutch
	for (let k = 0; k < 7; k++) {
		const a = (k / 7) * Math.PI * 2;
		const blade = addSys("cooling", group, slab(0.006, 0.12, 0.06, 0.02, 0.002), [BLOCK_FRONT + 0.128, pumpY + Math.cos(a) * 0.105, Math.sin(a) * 0.105], { outline: 0.004 });
		blade.rotation.set(a, 0.35, 0, "XYZ");
	}
	addSys("cooling", group, slab(0.05, 0.035, 0.055, 0.01, 0.005), [BLOCK_FRONT + 0.005, HEAD_TOP - 0.025, 0.075], { outline: O_SMALL });
	addSys(
		"cooling",
		group,
		tube(
			[
				[BLOCK_FRONT + 0.02, HEAD_TOP - 0.02, 0.075],
				[BLOCK_FRONT + 0.1, HEAD_TOP - 0.005, 0.085],
				[BLOCK_FRONT + 0.2, HEAD_TOP - 0.03, 0.1],
			],
			0.018,
		),
		[0, 0, 0],
		{ outline: O_SMALL },
	);

	// --- Accessories on belts: alternator (driver's side), AC compressor (passenger side, low) ---
	const pulleyX = BLOCK_FRONT + 0.064;
	const alt = { y: 0.1, z: -0.175, r: 0.034 };
	const acc = { y: 0.0, z: 0.17, r: 0.055 };
	addSys("electrical", group, xCyl(0.062, 0.1, 24), [BLOCK_FRONT - 0.005, alt.y, alt.z], { outline: O_SMALL });
	add(group, xCyl(alt.r, 0.018, 20), crinkle, [pulleyX, alt.y, alt.z], { outline: O_SMALL });
	add(group, slab(0.02, 0.1, 0.05, 0.006, 0.003), iron, [BLOCK_FRONT - 0.01, alt.y - 0.05, -0.14], { outline: O_SMALL }); // bracket
	addSys("ac", group, xCyl(0.055, 0.13, 24), [BLOCK_FRONT - 0.04, acc.y, acc.z], { outline: O_SMALL });
	add(group, xCyl(acc.r, 0.018, 24), crinkle, [pulleyX, acc.y, acc.z], { outline: O_SMALL });
	/** A belt wrapped round pulleys in the plane x = pulleyX: the convex hull of their rims. */
	const belt = (wheels: { y: number; z: number; r: number }[]) => {
		const rim: Vector2[] = [];
		for (const w of wheels) {
			for (let k = 0; k < 48; k++) {
				const a = (k / 48) * Math.PI * 2;
				rim.push(new Vector2(w.z + Math.cos(a) * (w.r + 0.004), w.y + Math.sin(a) * (w.r + 0.004)));
			}
		}
		const hull = convexHull(rim);
		add(group, tube(hull.map((p) => [pulleyX, p.y, p.x]), 0.005, true, hull.length * 2), rubber, [0, 0, 0], { outline: 0.003 });
	};
	belt([{ y: 0, z: 0, r: 0.075 }, { y: pumpY, z: 0, r: 0.06 }, alt]);
	belt([{ y: 0, z: 0, r: 0.075 }, acc]);

	// --- Distributor at the front of the driver's side, plug wires to the passenger-side plugs ---
	const dist = new Vector3(BLOCK_FRONT + 0.03, DECK_Y - 0.01, -0.085);
	const distBody = addSys("electrical", group, new CylinderGeometry(0.026, 0.03, 0.07, 16), [dist.x, dist.y, dist.z], { outline: O_SMALL });
	distBody.rotation.set(0.3, 0, -0.5);
	const capTop = dist.clone().add(new Vector3(0.022, 0.045, -0.015));
	addSys("electrical", group, new CylinderGeometry(0.042, 0.038, 0.035, 18), [capTop.x, capTop.y, capTop.z], { outline: O_SMALL }).rotation.set(0.3, 0, -0.5);
	CYLINDER_X.forEach((x, i) => {
		const plug = new Vector3(x, HEAD_TOP - 0.012, BLOCK_HALF_W - 0.01);
		const boot = new CylinderGeometry(0.009, 0.009, 0.04, 10);
		addSys("electrical", group, boot, [plug.x, plug.y, plug.z], { outline: 0.003 }).rotation.x = 0.5;
		addSys(
			"electrical",
			group,
			tube(
				[
					[capTop.x, capTop.y + 0.012, capTop.z + (i - 1.5) * 0.012],
					[BLOCK_FRONT - 0.02, coverY + 0.05, -0.03 + i * 0.012],
					[x + 0.02, coverY + 0.04, 0.07],
					[plug.x, plug.y + 0.018, plug.z + 0.01],
				],
				0.0045,
			),
			[0, 0, 0],
			{ outline: 0.0025 },
		);
	});

	// --- Intake: aluminum runners up into the EFI plenum, injectors and fuel rail, throttle body ---
	const plenum = { x: -0.015, y: HEAD_TOP + 0.06, z: 0.2, len: 0.36, h: 0.09, w: 0.11 };
	CYLINDER_X.forEach((x) => {
		add(
			group,
			tube(
				[
					[x, DECK_Y + 0.045, BLOCK_HALF_W - 0.005],
					[x, DECK_Y + 0.05, 0.165],
					[x, plenum.y - plenum.h / 2 - 0.02, plenum.z - 0.01],
				],
				0.018,
				false,
				20,
			),
			alu,
			[0, 0, 0],
			{ outline: O_SMALL },
		);
		const inj = addSys("fuel", group, new CylinderGeometry(0.008, 0.008, 0.05, 10), [x + 0.02, DECK_Y + 0.075, 0.14], { outline: 0.003 });
		inj.rotation.x = -0.5;
	});
	addSys("fuel", group, xCyl(0.008, CYLINDER_X[0] - CYLINDER_X[3] + 0.06, 10), [0.02, DECK_Y + 0.097, 0.128], { outline: 0.003 });
	addSys("fuel", group, slab(plenum.len, plenum.h, plenum.w, 0.03, 0.012), [plenum.x, plenum.y, plenum.z], { outline: O_BIG });
	// "EFI" cast into the plenum's outboard face, as on the real air intake chamber.
	lettering(group, "EFI", new Vector3(plenum.x - 0.04, plenum.y, plenum.z + plenum.w / 2), new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.042, 0.007, alu);
	const tbX = plenum.x + plenum.len / 2 + 0.028;
	addSys("fuel", group, xCyl(0.036, 0.056, 20), [tbX, plenum.y, plenum.z], { outline: O_SMALL });
	// The intake hose, cut short, heading forward and across toward the air flow meter on the driver's-side
	// air cleaner (the stock crossover duct, per Trail-Gear's 1989-95 22R-E intake instructions).
	add(group, tube(INTAKE_STUB.map((p) => [p[0], p[1], p[2]]), 0.035, false, 16), rubber, [0, 0, 0], { outline: O_SMALL });

	// --- Exhaust manifold on the driver's side: four runners into a log, then the down pipe at the back ---
	const logZ = -0.172;
	const logY = DECK_Y + 0.02;
	CYLINDER_X.forEach((x) => {
		add(group, tube([[x, DECK_Y + 0.045, -BLOCK_HALF_W + 0.005], [x, DECK_Y + 0.04, -0.15], [x - 0.01, logY, logZ]], 0.02, false, 12), rust, [0, 0, 0], { outline: O_SMALL });
	});
	add(group, xCyl(0.028, CYLINDER_X[0] - CYLINDER_X[3] + 0.04), rust, [0, logY, logZ], { outline: O_SMALL });
	add(
		group,
		tube(
			[
				[CYLINDER_X[3] - 0.01, logY, logZ],
				[CYLINDER_X[3] - 0.05, logY - 0.05, logZ - 0.01],
				[CYLINDER_X[3] - 0.07, 0.02, logZ - 0.02],
				[CYLINDER_X[3] - 0.08, -0.12, logZ - 0.02],
			],
			0.026,
			false,
			20,
		),
		rust,
		[0, 0, 0],
		{ outline: O_SMALL },
	);

	// --- Oil pan with its drain plug ---
	const panDepth = 0.12;
	addSys("oil", group, slab(blockLen - 0.02, panDepth, BLOCK_HALF_W * 2 - 0.01, 0.025, 0.01), [-0.005, PAN_Y - panDepth / 2, 0], { outline: O_BIG });
	add(group, new CylinderGeometry(0.008, 0.008, 0.012, 8), zinc, [-0.12, PAN_Y - panDepth - 0.004, 0.04], { outline: 0 });

	// --- Starter on the passenger side of the bellhousing ---
	addSys("electrical", group, xCyl(0.042, 0.15), [-BLOCK_FRONT + 0.05, -0.005, 0.16], { outline: O_SMALL });
	addSys("electrical", group, xCyl(0.024, 0.09), [-BLOCK_FRONT + 0.03, 0.058, 0.16], { outline: O_SMALL });

	// --- Bellhousing and the front of the gearbox, cut off: transmission / drivetrain ---
	// Profile from the cut end of the gearbox forward to the block face (increasing Y keeps the normals outward).
	const bell = [
		new Vector2(0.001, -0.29),
		new Vector2(0.1, -0.29),
		new Vector2(0.105, -0.19),
		new Vector2(0.18, -0.14),
		new Vector2(0.19, -0.03),
		new Vector2(0.16, 0),
	];
	const bellGeo = new LatheGeometry(bell, 36);
	bellGeo.rotateZ(-Math.PI / 2); // lathe axis Y -> X
	addSys("drivetrain", group, bellGeo, [-BLOCK_FRONT, 0, 0], { outline: O_BIG });

	setCrank(0);
	// Where a truck's intake duct picks up the hose, in the engine's frame.
	group.userData.intakeStubEnd = [...INTAKE_STUB[INTAKE_STUB.length - 1]];
	return { group, parts: kit.parts, systems, systemMaterials, setCrank, dispose: kit.dispose };
}
