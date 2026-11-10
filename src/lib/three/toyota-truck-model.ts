import {
	BackSide,
	BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	ExtrudeGeometry,
	Group,
	LatheGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Shape,
	TorusGeometry,
	Vector2,
	Vector3,
	type Material,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
	/** Front plastic bumper. */
	bumper: string;
	/** Rim steel and rear step bumper. */
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

const OUTLINE = 0.05; // big panels
const OUTLINE_SMALL = 0.03; // trim, tires, small parts

/** Inverted-hull outline: a copy pushed out along smooth normals, rendered back-faces only. */
function outlineGeometry(geo: BufferGeometry, thickness: number): BufferGeometry {
	const g = geo.clone();
	g.deleteAttribute("normal");
	g.deleteAttribute("uv");
	g.clearGroups();
	const merged = mergeVertices(g, 1e-4);
	merged.computeVertexNormals();
	const pos = merged.getAttribute("position");
	const nor = merged.getAttribute("normal");
	const v = new Vector3();
	const n = new Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		n.fromBufferAttribute(nor, i);
		v.addScaledVector(n, thickness);
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	pos.needsUpdate = true;
	return merged;
}

/** Rounded-rectangle outline in the XY plane, centered on the origin. */
function roundedRect(w: number, h: number, r: number): Shape {
	const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3);
	const x = -w / 2;
	const y = -h / 2;
	const s = new Shape();
	s.moveTo(x + rr, y);
	s.lineTo(x + w - rr, y);
	s.quadraticCurveTo(x + w, y, x + w, y + rr);
	s.lineTo(x + w, y + h - rr);
	s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
	s.lineTo(x + rr, y + h);
	s.quadraticCurveTo(x, y + h, x, y + h - rr);
	s.lineTo(x, y + rr);
	s.quadraticCurveTo(x, y, x + rr, y);
	return s;
}

/**
 * Extrude a shape along Z with softened edges. By default the result is centered on the origin;
 * pass `center: false` for profiles drawn in truck coordinates (only Z is centered then).
 */
function extrude(shape: Shape, depth: number, bevel: number, center = true): BufferGeometry {
	const b = Math.min(bevel, depth / 2 - 1e-3);
	const geo = new ExtrudeGeometry(shape, {
		depth: Math.max(depth - 2 * b, 1e-3),
		bevelEnabled: b > 0,
		bevelThickness: b,
		bevelSize: b,
		bevelOffset: -b,
		bevelSegments: 3,
		curveSegments: 12,
	});
	if (center) {
		geo.center();
	} else {
		geo.computeBoundingBox();
		const box = geo.boundingBox!;
		geo.translate(0, 0, -(box.min.z + box.max.z) / 2);
	}
	return geo;
}

/** A softened box: sx along X, sy along Y, sz along Z. */
function slab(sx: number, sy: number, sz: number, radius = 0.04, bevel = 0.02): BufferGeometry {
	return extrude(roundedRect(sx, sy, radius), sz, bevel);
}

/** Darken a hex color by mixing toward black. */
function shade(hex: string, amount: number): string {
	return `#${new Color(hex).multiplyScalar(1 - amount).getHexString()}`;
}

// Layout constants, in meters.
const WHEEL_R = 0.33;
const AXLE_Y = 0.33;
const FRONT_AXLE_X = 1.35;
const REAR_AXLE_X = -1.6;
const ARCH_R = 0.4;
const BODY_HALF_W = 0.82;
const BELT_Y = 0.98;
const NOSE_X = 2.18;
const CAB_BACK_X = -0.62;
const TAIL_X = -2.64;
const BED_FLOOR_Y = 0.665;

/** Side profile of hood + cab base, with the front wheel arch cut out of the bottom edge. */
function cabBodyProfile(): Shape {
	const s = new Shape();
	s.moveTo(NOSE_X, AXLE_Y);
	s.lineTo(FRONT_AXLE_X + ARCH_R, AXLE_Y);
	s.absarc(FRONT_AXLE_X, AXLE_Y, ARCH_R, 0, Math.PI, false);
	s.lineTo(CAB_BACK_X, AXLE_Y);
	s.lineTo(CAB_BACK_X, BELT_Y);
	s.lineTo(0.72, BELT_Y); // cowl
	s.lineTo(NOSE_X, 0.9); // hood slopes down to the nose
	s.lineTo(NOSE_X, AXLE_Y);
	return s;
}

/** Side profile of one bed wall, with the rear wheel arch cut out. */
function bedWallProfile(): Shape {
	const s = new Shape();
	s.moveTo(CAB_BACK_X, AXLE_Y);
	s.lineTo(REAR_AXLE_X + ARCH_R, AXLE_Y);
	s.absarc(REAR_AXLE_X, AXLE_Y, ARCH_R, 0, Math.PI, false);
	s.lineTo(TAIL_X, AXLE_Y);
	s.lineTo(TAIL_X, BELT_Y);
	s.lineTo(CAB_BACK_X, BELT_Y);
	s.lineTo(CAB_BACK_X, AXLE_Y);
	return s;
}

/** Semicircle that fills a wheel arch so it reads dark from the side. */
function archFill(): Shape {
	const s = new Shape();
	s.absarc(0, 0, ARCH_R - 0.02, 0, Math.PI, false);
	s.lineTo(ARCH_R - 0.02, 0);
	return s;
}

export function buildToyotaTruck(colors: TruckColors = DEFAULT_TRUCK_COLORS): TruckModel {
	const outlineMat = new MeshBasicMaterial({ color: colors.trim, side: BackSide });
	const materials: Material[] = [outlineMat];
	const geometries: BufferGeometry[] = [];

	const std = (color: string, roughness: number, metalness = 0.05) => {
		const m = new MeshStandardMaterial({ color, roughness, metalness });
		materials.push(m);
		return m;
	};
	const bodyMat = std(colors.body, 0.36, 0.35);
	const bedFloorMat = std(shade(colors.body, 0.45), 0.5, 0.2);
	const trimMat = std(colors.trim, 0.8);
	const bumperMat = std(colors.bumper, 0.7);
	const dishMat = std(shade(colors.silver, 0.35), 0.5, 0.6);
	const silverMat = std(colors.silver, 0.28, 0.85);
	const hubMat = std(colors.hub, 0.5);
	const amberMat = std(colors.amber, 0.4);
	const interiorMat = std(colors.interior, 0.85);
	const headMat = std(colors.light, 0.2);
	headMat.emissive = new Color(colors.light);
	headMat.emissiveIntensity = 0;
	const tailMat = std(colors.tail, 0.35);
	tailMat.emissive = new Color(colors.tail);
	tailMat.emissiveIntensity = 0;
	const glassMat = new MeshStandardMaterial({
		color: colors.glass,
		roughness: 0.05,
		metalness: 0.1,
		transparent: true,
		opacity: 0.26,
		depthWrite: false,
	});
	materials.push(glassMat);

	const group = new Group();
	const parts: Mesh[] = [];

	/**
	 * Add a mesh (and, optionally, an outline shell) to a parent. Geometry is disposed with the model.
	 * `outline` is the outline thickness; 0 skips the shell.
	 */
	const add = (
		parent: Group,
		geo: BufferGeometry,
		mat: Material,
		pos: [number, number, number],
		opts: { outline?: number; rot?: [number, number, number] } = {},
	) => {
		const { outline = OUTLINE_SMALL, rot } = opts;
		geometries.push(geo);
		const mesh = new Mesh(geo, mat);
		mesh.position.set(...pos);
		if (rot) mesh.rotation.set(...rot);
		parent.add(mesh);
		parts.push(mesh);
		if (outline > 0) {
			const shellGeo = outlineGeometry(geo, outline);
			geometries.push(shellGeo);
			const shell = new Mesh(shellGeo, outlineMat);
			shell.position.copy(mesh.position);
			shell.rotation.copy(mesh.rotation);
			parent.add(shell);
		}
		return mesh;
	};
	/** Both sides of the truck: mirrors Z. */
	const pair = (fn: (side: 1 | -1) => void) => {
		fn(1);
		fn(-1);
	};

	// --- Hood + cab base ---
	add(group, extrude(cabBodyProfile(), BODY_HALF_W * 2, 0.07, false), bodyMat, [0, 0, 0], { outline: OUTLINE });
	// Dark wheel well behind the front wheels.
	add(group, extrude(archFill(), BODY_HALF_W * 2 - 0.2, 0), trimMat, [FRONT_AXLE_X, AXLE_Y + (ARCH_R - 0.02) / 2, 0], {
		outline: 0,
	});

	// --- Bed: hollow, built from walls, a recessed floor, wheel wells, headboard and tailgate ---
	const bedLen = CAB_BACK_X - TAIL_X;
	const bedMidX = (TAIL_X + CAB_BACK_X) / 2;
	pair((side) => {
		add(group, extrude(bedWallProfile(), 0.08, 0.02, false), bodyMat, [0, 0, side * (BODY_HALF_W - 0.04)], {
			outline: OUTLINE,
		});
		// Rolled top rail along the wall.
		add(group, slab(bedLen, 0.05, 0.12, 0.02, 0.012), bodyMat, [bedMidX, BELT_Y, side * (BODY_HALF_W - 0.06)]);
		// Wheel well intruding into the bed.
		add(group, slab(0.95, 0.24, 0.22, 0.1, 0.03), bodyMat, [REAR_AXLE_X, BED_FLOOR_Y + 0.12, side * (BODY_HALF_W - 0.2)]);
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
	// Headboard behind the cab, taller than the rails.
	add(group, slab(0.07, 0.5, BODY_HALF_W * 2 - 0.1, 0.02, 0.015), bodyMat, [CAB_BACK_X - 0.05, BED_FLOOR_Y + 0.22, 0]);
	// Tailgate, flush with the walls.
	add(group, slab(0.07, 0.5, BODY_HALF_W * 2 - 0.08, 0.02, 0.015), bodyMat, [TAIL_X + 0.03, 0.75, 0], { outline: OUTLINE });
	add(group, slab(0.02, 0.06, 0.62, 0.015, 0.006), trimMat, [TAIL_X - 0.015, 0.84, 0], { outline: 0 }); // lettering strip
	add(group, slab(0.02, 0.1, 0.1, 0.02, 0.008), trimMat, [TAIL_X - 0.015, 0.93, 0], { outline: 0 }); // handle

	// --- Arch lips on every wheel opening ---
	pair((side) => {
		for (const x of [FRONT_AXLE_X, REAR_AXLE_X]) {
			add(group, new TorusGeometry(ARCH_R + 0.015, 0.035, 6, 24, Math.PI), trimMat, [x, AXLE_Y, side * (BODY_HALF_W + 0.01)], {
				outline: 0,
			});
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

	// Interior: dash, bench seat, headrests, and a steering wheel on the left (-Z, US market).
	add(group, slab(0.34, 0.1, 1.44, 0.04, 0.02), interiorMat, [0.5, BELT_Y + 0.02, 0], { outline: 0 });
	add(group, slab(0.16, 0.56, 1.38, 0.05, 0.03), interiorMat, [-0.36, 0.95, 0], { rot: [0, 0, 0.17], outline: 0 });
	pair((side) => {
		add(group, slab(0.1, 0.14, 0.3, 0.04, 0.02), interiorMat, [-0.41, 1.28, side * 0.37], { rot: [0, 0, 0.17], outline: 0 });
	});
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
	group.add(steering);

	// --- Front end ---
	add(group, slab(0.24, 0.26, 1.78, 0.07, 0.03), bumperMat, [NOSE_X + 0.1, 0.5, 0]); // wide plastic bumper
	add(group, slab(0.14, 0.16, 1.5, 0.05, 0.02), bumperMat, [NOSE_X + 0.02, 0.4, 0], { outline: 0.02 }); // air dam
	add(group, slab(0.06, 0.2, 0.7, 0.03, 0.01), silverMat, [NOSE_X + 0.01, 0.78, 0], { outline: 0.02 }); // grille frame
	for (let i = 0; i < 4; i++) {
		add(group, slab(0.02, 0.022, 0.62, 0.008, 0.004), trimMat, [NOSE_X + 0.045, 0.71 + i * 0.05, 0], { outline: 0 });
	}
	add(group, slab(0.02, 0.04, 0.16, 0.012, 0.005), silverMat, [NOSE_X + 0.05, 0.84, 0], { outline: 0 }); // badge
	pair((side) => {
		add(group, slab(0.07, 0.17, 0.34, 0.04, 0.015), headMat, [NOSE_X + 0.005, 0.76, side * 0.56], { outline: 0.02 });
		add(group, slab(0.04, 0.05, 0.1, 0.02, 0.008), amberMat, [NOSE_X, 0.62, side * 0.78], { outline: 0 });
		add(group, slab(0.06, 0.09, 0.2, 0.035, 0.012), amberMat, [NOSE_X + 0.2, 0.5, side * 0.72], { outline: 0 });
	});

	// --- Rear end ---
	add(group, slab(0.17, 0.17, 1.74, 0.05, 0.02), silverMat, [TAIL_X - 0.11, 0.45, 0]); // step bumper
	add(group, slab(0.02, 0.1, 0.22, 0.02, 0.008), silverMat, [TAIL_X - 0.02, 0.62, 0], { outline: 0 }); // plate
	pair((side) => {
		add(group, slab(0.04, 0.2, 0.14, 0.03, 0.01), tailMat, [TAIL_X - 0.005, 0.8, side * 0.74], { outline: 0.02 });
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
	materials.push(shadowMat);
	geometries.push(shadowGeo);
	const shadow = new Mesh(shadowGeo, shadowMat);
	shadow.scale.set(3.0, 1, 1.3);
	shadow.position.set(-0.25, 0.005, 0);
	group.add(shadow);

	return {
		group,
		wheels,
		parts,
		lights: { head: headMat, tail: tailMat },
		dispose: () => {
			geometries.forEach((g) => g.dispose());
			materials.forEach((m) => m.dispose());
		},
	};
}
